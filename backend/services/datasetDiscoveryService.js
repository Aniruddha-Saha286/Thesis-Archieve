const { URL } = require('url');
const crypto = require('crypto');
const { normalizeDoi, compareDois } = require('../utils/doiNormalizer');

// Bounded in-memory cache with 1-hour TTL (max 500 items)
const datasetCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

function getCached(key) {
  const item = datasetCache.get(key);
  if (!item) return null;
  if (Date.now() - item.cachedAt > CACHE_TTL_MS) {
    datasetCache.delete(key);
    return null;
  }
  // Return immutable deep copy to prevent cross-request cache pollution
  return JSON.parse(JSON.stringify(item.data));
}

function setCached(key, data) {
  if (datasetCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = datasetCache.keys().next().value;
    datasetCache.delete(oldestKey);
  }
  datasetCache.set(key, { data, cachedAt: Date.now() });
}

/**
 * SSRF Guard: Validates that an outbound dataset URL targets allowed public scholarly repositories
 * and does not point to internal networks, localhost, or cloud metadata services.
 */
function isSafeDatasetUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block private/local IP ranges and hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    // Whitelist approved scholarly dataset providers & public repositories
    const allowedDomains = [
      'datacite.org',
      'api.datacite.org',
      'zenodo.org',
      'api.zenodo.org',
      'doi.org',
      'dx.doi.org',
      'figshare.com',
      'datadryad.org',
      'dryad.org',
      'kaggle.com',
      'huggingface.co',
      'github.com',
      'osf.io',
      'ncbi.nlm.nih.gov',
      'ieee-dataport.org',
      'harvard.edu', // Harvard Dataverse
      'dataverse.org',
    ];

    return allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch (err) {
    return false;
  }
}

/**
 * Normalizes dataset format representation without fabricating fake "CSV" tags
 */
function extractFormats(formatsList, filesList) {
  const formats = new Set();

  if (Array.isArray(formatsList)) {
    for (const f of formatsList) {
      if (typeof f === 'string' && f.trim()) {
        const clean = f.trim().toUpperCase().replace(/^\./, '');
        if (clean) formats.add(clean);
      }
    }
  }

  if (Array.isArray(filesList)) {
    for (const file of filesList) {
      const name = file.key || file.filename || file.name || '';
      const ext = name.split('.').pop()?.toUpperCase();
      if (ext && ext.length <= 6 && ext !== name.toUpperCase()) {
        formats.add(ext);
      }
    }
  }

  return Array.from(formats);
}

/**
 * Inspects DataCite metadata relation type and direction truthfully.
 */
function evaluateDataCiteRelation(attrs, doi, isLinked) {
  if (doi && Array.isArray(attrs.relatedIdentifiers)) {
    const match = attrs.relatedIdentifiers.find((rel) => {
      return compareDois(rel.relatedIdentifier, doi);
    });

    if (match) {
      const relType = (match.relationType || '').toLowerCase().replace(/[^a-z]/g, '');
      if (relType === 'issupplementto') {
        return {
          relationType: 'Direct Supplemental Dataset',
          relationshipDirection: 'supplemental',
          relationEvidence: `DataCite relation 'IsSupplementTo': Verified dataset directly supplements publication.`,
        };
      }
      if (relType === 'issupplementedby') {
        return {
          relationType: 'Direct Supplemental Dataset',
          relationshipDirection: 'supplemental',
          relationEvidence: `DataCite relation 'IsSupplementedBy': Publication documents supplemental relationship with this dataset.`,
        };
      }
      if (
        relType.includes('reference') ||
        relType.includes('cites') ||
        relType.includes('isreferencedby') ||
        relType.includes('iscitedby')
      ) {
        return {
          relationType: 'Referenced Work / Citation',
          relationshipDirection: 'reference',
          relationEvidence: `DataCite relation '${match.relationType}': Cited in or referencing publication (not verified supplemental data).`,
        };
      }
      return {
        relationType: 'Associated Resource',
        relationshipDirection: 'associated',
        relationEvidence: `Declared DataCite relation: ${match.relationType}`,
      };
    }
  }

  return {
    relationType: isLinked ? 'Topic-Related Suggestion' : 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: isLinked
      ? 'Discovered via repository query without verified supplemental relation.'
      : 'Discovered through keyword matching against dataset titles and abstracts.',
  };
}

/**
 * Searches DataCite for datasets explicitly linked or related to a DOI or keyword
 * Supports genuine pagination with page number and page size.
 */
async function queryDataCite({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    if (process.env.OFFLINE_MODE === 'true') {
      const records = [
        {
          id: `datacite_offline_${pageNum}_1`,
          title: `DataCite Research Dataset for ${query || doi || 'Scientific Study'}`,
          url: 'https://doi.org/10.5281/zenodo.7627309',
          doi: '10.5281/zenodo.7627309',
          publisher: 'DataCite Depository',
          publicationYear: 2024,
          description: 'Deterministic offline fixture dataset for regression tests.',
          formats: ['CSV', 'JSON'],
          size: '12 MB',
          license: 'CC-BY-4.0',
          isLinked: Boolean(isLinked),
          relationType: isLinked ? 'Primary Associated Dataset' : 'Topic Similarity Discovery',
          relationshipDirection: isLinked ? 'supplemental' : 'topic',
          relationEvidence: 'Deterministic offline fixture evidence.',
          source: 'DataCite',
          sourceUrl: 'https://doi.org/10.5281/zenodo.7627309',
        },
      ];
      return { records, totalCount: 1, hasMore: false, error: null };
    }

    let url;
    if (doi) {
      url = `https://api.datacite.org/dois?query=relatedIdentifiers.relatedIdentifier:${encodeURIComponent(doi)}&resource-type-id=dataset&page[number]=${pageNum}&page[size]=${size}`;
    } else if (query) {
      url = `https://api.datacite.org/dois?query=${encodeURIComponent(query)}&resource-type-id=dataset&page[number]=${pageNum}&page[size]=${size}`;
    } else {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `DataCite HTTP ${res.status}` };
    }

    const data = await res.json();
    const items = data.data || [];
    const totalCount = data.meta?.total || items.length;

    const mapped = items.map((item) => {
      const attrs = item.attributes || {};
      const title = attrs.titles?.[0]?.title || 'Scholarly Dataset';
      const itemDoi = attrs.doi || null;
      const directUrl = attrs.url || (itemDoi ? `https://doi.org/${itemDoi}` : null);
      const formats = extractFormats(attrs.formats, null);

      // Honest license representation (never fabricate Open Access when missing)
      let license = 'Unknown / Not specified';
      if (attrs.rightsList && attrs.rightsList.length > 0) {
        license = attrs.rightsList[0].rightsIdentifier || attrs.rightsList[0].rights || 'Unknown / Not specified';
      }

      const rel = evaluateDataCiteRelation(attrs, doi, isLinked);

      return {
        id: `datacite_${item.id || itemDoi}`,
        title,
        url: directUrl,
        doi: itemDoi,
        publisher: attrs.publisher || 'DataCite Depository',
        publicationYear: attrs.publicationYear || null,
        description: attrs.descriptions?.[0]?.description ? attrs.descriptions[0].description.slice(0, 300) : null,
        formats: formats.length > 0 ? formats : [],
        size: null,
        license,
        isLinked,
        relationType: rel.relationType,
        relationshipDirection: rel.relationshipDirection,
        relationEvidence: rel.relationEvidence,
        source: 'DataCite',
        sourceUrl: directUrl,
      };
    }).filter((d) => d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      totalCount,
      hasMore: totalCount > pageNum * size,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

/**
 * Inspects Zenodo metadata relation type and direction truthfully.
 */
function evaluateZenodoRelation(meta, doi, isLinked) {
  if (doi && Array.isArray(meta.related_identifiers)) {
    const match = meta.related_identifiers.find((rel) => {
      return compareDois(rel.identifier, doi);
    });

    if (match) {
      const relType = (match.relation || '').toLowerCase().replace(/[^a-z]/g, '');
      if (relType === 'issupplementto') {
        return {
          relationType: 'Direct Supplemental Dataset',
          relationshipDirection: 'supplemental',
          relationEvidence: `Zenodo relation 'isSupplementTo': Verified dataset directly supplements publication.`,
        };
      }
      if (relType === 'issupplementedby') {
        return {
          relationType: 'Direct Supplemental Dataset',
          relationshipDirection: 'supplemental',
          relationEvidence: `Zenodo relation 'isSupplementedBy': Publication documents supplemental relationship with this dataset.`,
        };
      }
      if (
        relType.includes('reference') ||
        relType.includes('cites') ||
        relType.includes('isreferencedby') ||
        relType.includes('iscitedby')
      ) {
        return {
          relationType: 'Referenced Work / Citation',
          relationshipDirection: 'reference',
          relationEvidence: `Zenodo relation '${match.relation}': Cites or referenced by publication (not verified supplemental data).`,
        };
      }
      return {
        relationType: 'Associated Resource',
        relationshipDirection: 'associated',
        relationEvidence: `Declared Zenodo relation: ${match.relation}`,
      };
    }
  }

  return {
    relationType: isLinked ? 'Topic-Related Suggestion' : 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: isLinked
      ? 'Discovered via repository query without verified supplemental relation.'
      : 'Discovered through keyword matching against Zenodo record metadata.',
  };
}

/**
 * Searches Zenodo for datasets explicitly linked or related
 * Supports genuine pagination with page number and page size.
 */
async function queryZenodo({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    if (process.env.OFFLINE_MODE === 'true') {
      const records = [
        {
          id: `zenodo_offline_${pageNum}_1`,
          title: `Zenodo Open Dataset for ${query || doi || 'Precipitation Models'}`,
          url: 'https://zenodo.org/records/7627309',
          doi: '10.5281/zenodo.7627309',
          publisher: 'Zenodo Open Repository',
          publicationYear: 2024,
          description: 'Deterministic offline fixture dataset for regression tests.',
          formats: ['ZIP'],
          size: '1.4 GB',
          license: 'CC-BY-4.0',
          isLinked: Boolean(isLinked),
          relationType: isLinked ? 'Primary Associated Dataset' : 'Topic Similarity Discovery',
          relationshipDirection: isLinked ? 'supplemental' : 'topic',
          relationEvidence: 'Deterministic offline fixture evidence.',
          source: 'Zenodo',
          sourceUrl: 'https://zenodo.org/records/7627309',
        },
      ];
      return { records, totalCount: 1, hasMore: false, error: null };
    }

    let url;
    if (doi) {
      url = `https://zenodo.org/api/records?q=related.identifier:"${encodeURIComponent(doi)}"&type=dataset&page=${pageNum}&size=${size}`;
    } else if (query) {
      url = `https://zenodo.org/api/records?q=${encodeURIComponent(query)}&type=dataset&page=${pageNum}&size=${size}`;
    } else {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `Zenodo HTTP ${res.status}` };
    }

    const data = await res.json();
    const items = data.hits?.hits || [];
    const totalCount = data.hits?.total || items.length;

    const mapped = items.map((hit) => {
      const meta = hit.metadata || {};
      const title = meta.title || 'Zenodo Open Research Dataset';
      const hitDoi = hit.doi || meta.doi || null;
      const doiUrl = hit.doi_url || (hitDoi ? `https://doi.org/${hitDoi}` : `https://zenodo.org/records/${hit.id}`);
      const files = hit.files || [];
      const formats = extractFormats(null, files);

      let totalBytes = 0;
      for (const f of files) {
        if (typeof f.size === 'number') totalBytes += f.size;
      }

      let sizeFormatted = null;
      if (totalBytes > 0) {
        if (totalBytes > 1024 * 1024 * 1024) {
          sizeFormatted = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        } else if (totalBytes > 1024 * 1024) {
          sizeFormatted = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        } else {
          sizeFormatted = `${(totalBytes / 1024).toFixed(0)} KB`;
        }
      }

      // Honest license representation
      let license = 'Unknown / Not specified';
      if (meta.license) {
        license = meta.license.id || (typeof meta.license === 'string' ? meta.license : 'Unknown / Not specified');
      }

      const rel = evaluateZenodoRelation(meta, doi, isLinked);

      return {
        id: `zenodo_${hit.id}`,
        title,
        url: doiUrl,
        doi: hitDoi,
        publisher: 'Zenodo / CERN Open Science',
        publicationYear: meta.publication_date ? new Date(meta.publication_date).getFullYear() : null,
        description: meta.description ? meta.description.replace(/<[^>]*>/g, '').slice(0, 300) : null,
        formats: formats.length > 0 ? formats : [],
        size: sizeFormatted,
        license,
        isLinked,
        relationType: rel.relationType,
        relationshipDirection: rel.relationshipDirection,
        relationEvidence: rel.relationEvidence,
        source: 'Zenodo',
        sourceUrl: doiUrl,
      };
    }).filter((d) => d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      totalCount,
      hasMore: totalCount > pageNum * size,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

/**
 * Searches Figshare for open scientific datasets
 */
async function queryFigshare({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    if (process.env.OFFLINE_MODE === 'true') {
      const records = [
        {
          id: `figshare_offline_${pageNum}_1`,
          title: `Figshare Open Dataset for ${query || doi || 'Research Artifacts'}`,
          url: 'https://figshare.com/articles/dataset/offline_sample/12345678',
          doi: '10.6084/m9.figshare.12345678',
          publisher: 'Figshare Open Repository',
          publicationYear: 2024,
          description: 'Deterministic offline fixture dataset for regression tests.',
          formats: ['DATASET'],
          size: '250 MB',
          license: 'Unknown / Not specified',
          isLinked: false,
          relationType: 'Topic Similarity Discovery',
          relationshipDirection: 'topic',
          relationEvidence: 'Deterministic offline Figshare fixture without verified relation.',
          source: 'Figshare',
          sourceUrl: 'https://figshare.com/articles/dataset/offline_sample/12345678',
        },
      ];
      return { records, totalCount: 1, hasMore: false, error: null };
    }

    const searchTerm = (doi || query || '').trim();
    if (!searchTerm) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const body = {
      search_for: searchTerm,
      page: pageNum,
      page_size: Math.min(size, 20),
      item_type: 3, // Datasets
    };

    const res = await fetch('https://api.figshare.com/v2/articles/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `Figshare HTTP ${res.status}` };
    }

    const items = await res.json();
    if (!Array.isArray(items)) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const mapped = items
      .map((it) => {
        const itemDoi = it.doi ? it.doi.toLowerCase().trim() : null;
        const itemUrl =
          it.url_public_html ||
          (itemDoi ? `https://doi.org/${itemDoi}` : `https://figshare.com/articles/dataset/${it.id}`);

        // Verify genuine relational evidence from Figshare metadata
        const hasVerifiedRel = Boolean(
          doi && it.resource_doi && compareDois(it.resource_doi, doi)
        );

        let license = 'Unknown / Not specified';
        if (it.license) {
          license = typeof it.license === 'object' ? it.license.name || it.license.title || 'Unknown / Not specified' : String(it.license);
        }

        return {
          id: `figshare_${it.id}`,
          title: it.title || 'Figshare Research Dataset',
          url: itemUrl,
          doi: itemDoi,
          publisher: 'Figshare Open Repository',
          publicationYear: it.published_date ? new Date(it.published_date).getFullYear() : null,
          description: null,
          formats: ['DATASET'],
          size: null,
          license,
          isLinked: hasVerifiedRel,
          relationType: hasVerifiedRel ? 'Direct Supplemental Dataset' : 'Topic Similarity Discovery',
          relationshipDirection: hasVerifiedRel ? 'supplemental' : 'topic',
          relationEvidence: hasVerifiedRel
            ? 'Verified Figshare resource_doi matches publication DOI.'
            : 'Discovered through search against Figshare repository without verified relation.',
          source: 'Figshare',
          sourceUrl: itemUrl,
        };
      })
      .filter((d) => d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      totalCount: mapped.length,
      hasMore: items.length >= size,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

/**
 * Searches Dryad for curated scientific data packages
 */
async function queryDryad({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    if (process.env.OFFLINE_MODE === 'true') {
      const records = [
        {
          id: `dryad_offline_${pageNum}_1`,
          title: `Dryad Open Dataset for ${query || doi || 'Scientific Repository'}`,
          url: 'https://datadryad.org/stash/dataset/doi:10.5061/dryad.offline',
          doi: '10.5061/dryad.offline',
          publisher: 'Dryad Digital Repository',
          publicationYear: 2024,
          description: 'Deterministic offline fixture dataset for regression tests.',
          formats: ['DATASET'],
          size: '50 MB',
          license: 'CC0 1.0 Universal',
          isLinked: false,
          relationType: 'Topic Similarity Discovery',
          relationshipDirection: 'topic',
          relationEvidence: 'Deterministic offline Dryad fixture without verified relation.',
          source: 'Dryad',
          sourceUrl: 'https://datadryad.org/stash/dataset/doi:10.5061/dryad.offline',
        },
      ];
      return { records, totalCount: 1, hasMore: false, error: null };
    }

    const searchTerm = (doi || query || '').trim();
    if (!searchTerm) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const url = `https://datadryad.org/api/v2/search?q=${encodeURIComponent(searchTerm)}&page=${pageNum}&per_page=${Math.min(size, 20)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `Dryad HTTP ${res.status}` };
    }

    const data = await res.json();
    const items = data._embedded?.['stash:datasets'] || [];
    const totalCount = typeof data.total === 'number' ? data.total : items.length;

    const mapped = items
      .map((it) => {
        const rawId = (it.identifier || '').replace(/^doi:/i, '').trim();
        const itemDoi = rawId ? rawId.toLowerCase() : null;
        let itemUrl = itemDoi ? `https://doi.org/${itemDoi}` : null;
        if (!itemUrl && it.sharingLink) {
          itemUrl = it.sharingLink.replace(/^http:\/\//, 'https://');
        }
        if (!itemUrl) {
          itemUrl = `https://datadryad.org/stash/dataset/doi:${itemDoi || it.id}`;
        }

        let sizeFormatted = null;
        if (typeof it.storageSize === 'number' && it.storageSize > 0) {
          if (it.storageSize > 1024 * 1024 * 1024) {
            sizeFormatted = `${(it.storageSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
          } else if (it.storageSize > 1024 * 1024) {
            sizeFormatted = `${(it.storageSize / (1024 * 1024)).toFixed(1)} MB`;
          } else {
            sizeFormatted = `${(it.storageSize / 1024).toFixed(0)} KB`;
          }
        }

        let license = 'CC0 1.0 Universal';
        if (it.license && typeof it.license === 'string') {
          if (it.license.includes('CC0')) license = 'CC0 1.0 Universal';
          else license = it.license;
        }

        // Strict relationship verification: verify that Dryad metadata explicitly links to the queried DOI
        let hasVerifiedRel = false;
        if (doi && Array.isArray(it.relatedWorks)) {
          hasVerifiedRel = it.relatedWorks.some((rw) => {
            const isRelType =
              rw.relationship === 'primary_article' ||
              rw.relationship === 'supplemental_material';
            const cleanId = (rw.identifier || '')
              .replace(/^https?:\/\/doi\.org\//i, '')
              .replace(/^doi:/i, '')
              .trim();
            return isRelType && compareDois(cleanId, doi);
          });
        }

        return {
          id: `dryad_${it.id || (itemDoi ? itemDoi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7))}`,
          title: it.title || 'Dryad Open Research Dataset',
          url: itemUrl,
          doi: itemDoi,
          publisher: 'Dryad Digital Repository',
          publicationYear: it.publicationDate ? new Date(it.publicationDate).getFullYear() : null,
          description: it.abstract ? it.abstract.replace(/<[^>]*>/g, '').slice(0, 300) : null,
          formats: ['DATASET'],
          size: sizeFormatted,
          license,
          isLinked: hasVerifiedRel,
          relationType: hasVerifiedRel ? 'Direct Supplemental Dataset' : 'Topic Similarity Discovery',
          relationshipDirection: hasVerifiedRel ? 'supplemental' : 'topic',
          relationEvidence: hasVerifiedRel
            ? 'Declared primary article relationship in Dryad metadata matches publication DOI.'
            : 'Discovered through search against Dryad repository without verified relation.',
          source: 'Dryad',
          sourceUrl: itemUrl,
        };
      })
      .filter((d) => d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      totalCount,
      hasMore: totalCount > pageNum * size,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

/**
 * Enriches a specific paper with authentic Linked Datasets (explicit DOI relations)
 * and complementary Related Datasets (topic similarity discovery)
 */
async function enrichPaperDatasets({
  paperId = null,
  doi = null,
  title = '',
  explicitDatasetUrl = null,
  explicitDatasetFormat = null,
  explicitDatasetSize = null,
}) {
  const normId = paperId ? String(paperId).trim() : '';
  const normDoi = doi ? String(doi).trim().toLowerCase() : '';
  const normTitle = title ? String(title).trim().toLowerCase() : '';
  const normUrl = explicitDatasetUrl ? String(explicitDatasetUrl).trim().toLowerCase() : '';

  // Deterministic SHA-256 cache key ensuring zero cross-paper cache leakage
  const keyPayload = `${normId}|${normDoi}|${normTitle}|${normUrl}`;
  const cacheKey = `enrich_${crypto.createHash('sha256').update(keyPayload).digest('hex')}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const linkedDatasets = [];
  const relatedDatasets = [];
  const seenDois = new Set();
  const seenUrls = new Set();
  const providerErrors = {};

  // 1. Author-deposited datasetUrl
  if (explicitDatasetUrl && isSafeDatasetUrl(explicitDatasetUrl)) {
    const formats = explicitDatasetFormat ? [explicitDatasetFormat.toUpperCase()] : [];
    linkedDatasets.push({
      id: `deposited_${Date.now()}`,
      title: `${title || 'Research'} Accompanying Dataset`,
      url: explicitDatasetUrl,
      doi: null,
      publisher: 'Author Academic Deposit',
      publicationYear: null,
      formats,
      size: explicitDatasetSize || null,
      license: 'Unknown / Not specified',
      isLinked: true,
      relationType: 'Primary Associated Dataset',
      relationshipDirection: 'supplemental',
      relationEvidence: 'Author-provided repository dataset link.',
      source: 'Author Deposit',
      sourceUrl: explicitDatasetUrl,
    });
    seenUrls.add(explicitDatasetUrl.toLowerCase());
  }

  // 2. Fetch linked datasets via DOI relations if DOI is present
  if (doi) {
    const [dcLinkedRes, zenodoLinkedRes, figshareLinkedRes, dryadLinkedRes] = await Promise.all([
      queryDataCite({ doi, isLinked: true, page: 1, size: 5 }),
      queryZenodo({ doi, isLinked: true, page: 1, size: 5 }),
      queryFigshare({ doi, isLinked: true, page: 1, size: 5 }),
      queryDryad({ doi, isLinked: true, page: 1, size: 5 }),
    ]);

    if (dcLinkedRes.error) providerErrors.DataCite = dcLinkedRes.error;
    if (zenodoLinkedRes.error) providerErrors.Zenodo = zenodoLinkedRes.error;
    if (figshareLinkedRes.error) providerErrors.Figshare = figshareLinkedRes.error;
    if (dryadLinkedRes.error) providerErrors.Dryad = dryadLinkedRes.error;

    for (const d of [
      ...dcLinkedRes.records,
      ...zenodoLinkedRes.records,
      ...figshareLinkedRes.records,
      ...dryadLinkedRes.records,
    ]) {
      const dKey = d.doi ? d.doi.toLowerCase() : d.url.toLowerCase();
      if (!seenDois.has(dKey) && !seenUrls.has(d.url.toLowerCase())) {
        if (d.doi) seenDois.add(d.doi.toLowerCase());
        seenUrls.add(d.url.toLowerCase());
        if (d.relationshipDirection === 'supplemental') {
          d.isLinked = true;
          linkedDatasets.push(d);
        } else {
          d.isLinked = false;
          relatedDatasets.push(d);
        }
      }
    }
  }

  // 3. Fetch related datasets by title/topic keywords
  if (title && title.trim().length > 5) {
    const cleanWords = title
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5)
      .join(' ');

    if (cleanWords) {
      const [dcRelatedRes, zenodoRelatedRes, figshareRelatedRes, dryadRelatedRes] = await Promise.all([
        queryDataCite({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryZenodo({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryFigshare({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryDryad({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
      ]);

      if (dcRelatedRes.error && !providerErrors.DataCite) providerErrors.DataCite = dcRelatedRes.error;
      if (zenodoRelatedRes.error && !providerErrors.Zenodo) providerErrors.Zenodo = zenodoRelatedRes.error;
      if (figshareRelatedRes.error && !providerErrors.Figshare) providerErrors.Figshare = figshareRelatedRes.error;
      if (dryadRelatedRes.error && !providerErrors.Dryad) providerErrors.Dryad = dryadRelatedRes.error;

      for (const d of [
        ...dcRelatedRes.records,
        ...zenodoRelatedRes.records,
        ...figshareRelatedRes.records,
        ...dryadRelatedRes.records,
      ]) {
        const dKey = d.doi ? d.doi.toLowerCase() : d.url.toLowerCase();
        if (!seenDois.has(dKey) && !seenUrls.has(d.url.toLowerCase())) {
          if (d.doi) seenDois.add(d.doi.toLowerCase());
          seenUrls.add(d.url.toLowerCase());
          d.isLinked = false;
          relatedDatasets.push(d);
        }
      }
    }
  }

  const hasOutage = Boolean(
    (doi &&
      providerErrors.DataCite &&
      providerErrors.Zenodo &&
      providerErrors.Figshare &&
      providerErrors.Dryad) ||
      Object.keys(providerErrors).length >= 4
  );

  const result = {
    linkedDatasets,
    relatedDatasets,
    totalCount: linkedDatasets.length + relatedDatasets.length,
    providerErrors: Object.keys(providerErrors).length > 0 ? providerErrors : null,
    hasOutage,
    retrievedAt: new Date().toISOString(),
  };

  // Only cache if there is not a total provider outage
  if (!result.hasOutage) {
    setCached(cacheKey, result);
  }
  return result;
}

/**
 * Searches across official open science data repositories (DataCite, Zenodo, Figshare, Dryad)
 * Genuine page-based pagination with provider cursor forwarding.
 */
async function searchGlobalDatasets({ query = '', page = 1, limit = 15 }) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(30, Math.max(5, parseInt(limit) || 15));
  const cleanQ = (query || 'research dataset').trim();

  const cacheKey = `search_${cleanQ}_${pageNum}_${limitNum}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const quarterLimit = Math.max(2, Math.ceil(limitNum / 4));
  const [dcRes, zenodoRes, figshareRes, dryadRes] = await Promise.all([
    queryDataCite({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryZenodo({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryFigshare({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryDryad({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
  ]);

  const providerErrors = {};
  if (dcRes.error) providerErrors.DataCite = dcRes.error;
  if (zenodoRes.error) providerErrors.Zenodo = zenodoRes.error;
  if (figshareRes.error) providerErrors.Figshare = figshareRes.error;
  if (dryadRes.error) providerErrors.Dryad = dryadRes.error;

  const combined = [];
  const seenDois = new Set();
  const seenUrls = new Set();

  for (const d of [
    ...dcRes.records,
    ...zenodoRes.records,
    ...figshareRes.records,
    ...dryadRes.records,
  ]) {
    const dKey = d.doi ? d.doi.toLowerCase() : d.url.toLowerCase();
    if (!seenDois.has(dKey) && !seenUrls.has(d.url.toLowerCase())) {
      if (d.doi) seenDois.add(d.doi.toLowerCase());
      seenUrls.add(d.url.toLowerCase());
      combined.push(d);
    }
  }

  const hasMore = Boolean(
    dcRes.hasMore ||
      zenodoRes.hasMore ||
      figshareRes.hasMore ||
      dryadRes.hasMore ||
      combined.length >= limitNum
  );

  const result = {
    datasets: combined,
    pagination: {
      page: pageNum,
      limit: limitNum,
      returnedCount: combined.length,
      hasMore,
    },
    providerErrors: Object.keys(providerErrors).length > 0 ? providerErrors : null,
    hasOutage: Object.keys(providerErrors).length >= 4,
    retrievedAt: new Date().toISOString(),
  };

  // Only cache if at least one provider was reached
  if (!result.hasOutage) {
    setCached(cacheKey, result);
  }
  return result;
}

module.exports = {
  isSafeDatasetUrl,
  queryDataCite,
  queryZenodo,
  queryFigshare,
  queryDryad,
  enrichPaperDatasets,
  searchGlobalDatasets,
};
