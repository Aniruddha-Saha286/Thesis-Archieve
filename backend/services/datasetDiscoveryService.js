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

// ---------------------------------------------------------------------------
// Newer sources: Hugging Face, Harvard Dataverse and OpenAIRE ScholeXplorer
// ---------------------------------------------------------------------------
// They follow the same rules as the four sources above:
//   - same arguments in, same { records, totalCount, hasMore, error } out
//   - every record carries the same fields, so the pages that show datasets need no changes
//     (a few extra fields such as "authors" or "downloads" are added on top)
//   - every link is checked with isSafeDatasetUrl before it is returned
//   - nothing is thrown: a failure comes back in "error", so one broken source can never
//     take the others down with it
//   - a 5 second limit per request
// One difference: in OFFLINE_MODE these three read a saved copy of a real-shaped response
// from tests/fixtures and run it through the normal mapping code, so the deterministic
// test run exercises the same code path as production.

const DATASET_USER_AGENT = 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)';

// The offline fixtures live with the tests. If the tests folder is not deployed, offline
// mode simply returns nothing for these sources.
function loadOfflineDatasetFixture(name) {
  try {
    return require('../tests/fixtures/datasetSourceFixtures')[name] || null;
  } catch (err) {
    return null;
  }
}

// Reads the year from the start of a date such as "2019-12-11T15:26:10Z". Returns null
// instead of NaN when the date is missing or unreadable, so the page never prints "NaN".
function yearFromDate(value) {
  const match = /^(\d{4})/.exec(typeof value === 'string' ? value.trim() : '');
  return match ? Number(match[1]) : null;
}

// Keeps only real, non-empty text values from a list (drops nulls, objects, blanks).
function cleanStringList(list, max = 20) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (typeof entry === 'string' && entry.trim() && !out.includes(entry.trim())) {
      out.push(entry.trim());
    }
    if (out.length >= max) break;
  }
  return out;
}

// Hugging Face stores most facts about a dataset as "name:value" tags, for example
// "language:en" or "license:mit". This returns every value for one name.
function huggingFaceTagValues(tags, name) {
  if (!Array.isArray(tags)) return [];
  const prefix = `${name}:`;
  const values = [];
  for (const tag of tags) {
    if (typeof tag === 'string' && tag.startsWith(prefix)) {
      const value = tag.slice(prefix.length).trim();
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
}

// The Hub builds its "description" from the dataset's README. It is full of tabs and line
// breaks and usually opens with the headings "Dataset Card for X" and "Dataset Summary",
// which tell the reader nothing. Tidy it into one short readable paragraph.
function cleanHuggingFaceDescription(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^Dataset Card for\s.{1,80}?\sDataset Summary\s+/i, '')
    .replace(/^Dataset Card for\s+"[^"]{1,80}"\s*/i, '')
    .trim();
  return text ? text.slice(0, 300) : null;
}

// Hugging Face describes size as a range of row counts, written like "10K<n<100K".
// Turn that into words a visitor can read. This is a number of rows, not a file size.
function describeHuggingFaceSize(category) {
  if (typeof category !== 'string') return null;
  const text = category.trim();
  let match = /^([\w.]+)<n<([\w.]+)$/i.exec(text);
  if (match) return `${match[1]}-${match[2]} rows`;
  match = /^n<([\w.]+)$/i.exec(text);
  if (match) return `under ${match[1]} rows`;
  match = /^n>([\w.]+)$/i.exec(text);
  if (match) return `over ${match[1]} rows`;
  return null;
}

// A dataset id is "name" or "owner/name", made of letters, digits, dot, dash and underscore.
// We build the link from the id, so anything else is refused.
const HUGGING_FACE_ID_PATTERN = /^[A-Za-z0-9][\w.-]*(\/[A-Za-z0-9][\w.-]*)?$/;

// The Hub has no "page 2" parameter for this call (it pages with one-time cursors), so to
// show page N we ask for the first N pages' worth and keep the last slice. This cap stops
// a very deep page from turning into a huge download.
const HUGGING_FACE_MAX_FETCH = 100;

function mapHuggingFaceItem(item) {
  if (!item || typeof item !== 'object') return null;
  const hubId = typeof item.id === 'string' ? item.id.trim() : '';
  if (!HUGGING_FACE_ID_PATTERN.test(hubId)) return null;
  // Private or switched-off datasets cannot be opened by a visitor, so do not list them.
  if (item.disabled === true || item.private === true) return null;

  const card = item.cardData && typeof item.cardData === 'object' ? item.cardData : {};
  const tags = Array.isArray(item.tags) ? item.tags : [];
  // The tags are worked out by the Hub from the actual files, the card is typed in by the
  // uploader. Prefer the tags and fall back to the card.
  const fromTagsOrCard = (tagName, cardKey) => {
    const fromTags = huggingFaceTagValues(tags, tagName);
    if (fromTags.length > 0) return fromTags;
    const cardValue = card[cardKey];
    return cleanStringList(Array.isArray(cardValue) ? cardValue : [cardValue]);
  };

  const languages = fromTagsOrCard('language', 'language');
  const taskCategories = fromTagsOrCard('task_categories', 'task_categories');
  const sizeCategory = fromTagsOrCard('size_categories', 'size_categories')[0] || null;
  const modalities = huggingFaceTagValues(tags, 'modality');

  // Honest license representation: "unknown" on the Hub means exactly that
  const licenseId = fromTagsOrCard('license', 'license')[0] || null;
  const license = licenseId && licenseId.toLowerCase() !== 'unknown' ? licenseId : 'Unknown / Not specified';

  // Some Hub datasets have a DOI. Keeping it lets us spot the same dataset in DataCite.
  const itemDoi = normalizeDoi(huggingFaceTagValues(tags, 'doi')[0] || '');
  const url = `https://huggingface.co/datasets/${hubId}`;
  const author = typeof item.author === 'string' && item.author.trim() ? item.author.trim() : hubId.includes('/') ? hubId.split('/')[0] : null;

  return {
    id: `huggingface_${hubId}`,
    title: hubId,
    url,
    doi: itemDoi,
    publisher: 'Hugging Face Hub',
    publicationYear: yearFromDate(item.createdAt),
    description: cleanHuggingFaceDescription(item.description),
    // Only file formats the Hub itself reports (never invented)
    formats: extractFormats(huggingFaceTagValues(tags, 'format'), null),
    size: describeHuggingFaceSize(sizeCategory),
    license,
    isLinked: false,
    relationType: 'Topic Similarity Discovery',
    relationshipDirection: 'topic',
    relationEvidence: 'Discovered through keyword search of the Hugging Face Hub dataset catalogue.',
    source: 'Hugging Face',
    sourceUrl: url,
    // Extra details that only this source has
    authors: author ? [author] : [],
    tags: cleanStringList([...taskCategories, ...modalities, ...languages], 12),
    languages: languages.slice(0, 20),
    taskCategories,
    sizeCategory,
    downloads: typeof item.downloads === 'number' ? item.downloads : null,
    likes: typeof item.likes === 'number' ? item.likes : null,
    lastModified: typeof item.lastModified === 'string' ? item.lastModified : null,
    // true when the owner asks visitors to request access before downloading
    gated: Boolean(item.gated),
  };
}

/**
 * Searches the Hugging Face Hub for datasets (mostly machine-learning data).
 * Keyword search only: the Hub cannot be asked "which datasets belong to this paper",
 * so a call that has a DOI but no keywords returns nothing without calling out.
 * Results come back most-downloaded first.
 */
async function queryHuggingFace({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(size) || 5), 20);
    const searchTerm = (query || '').trim();
    if (!searchTerm) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const wanted = pageNum * pageSize;
    if (wanted > HUGGING_FACE_MAX_FETCH) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    let items;
    if (process.env.OFFLINE_MODE === 'true') {
      items = loadOfflineDatasetFixture('huggingFaceDatasetsResponse') || [];
    } else {
      // full=true adds the dataset card (licence, languages, tasks) to each result.
      const url = `https://huggingface.co/api/datasets?search=${encodeURIComponent(searchTerm)}&limit=${wanted}&full=true&sort=downloads&direction=-1`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': DATASET_USER_AGENT,
        },
      });

      if (!res.ok) {
        return { records: [], totalCount: 0, hasMore: false, error: `Hugging Face HTTP ${res.status}` };
      }

      items = await res.json();
    }

    if (!Array.isArray(items)) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const mapped = items
      .slice(wanted - pageSize, wanted)
      .map(mapHuggingFaceItem)
      .filter((d) => d && d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      // The Hub does not say how many datasets match in total
      totalCount: mapped.length,
      hasMore: items.length >= wanted && wanted < HUGGING_FACE_MAX_FETCH,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

// Dataverse search is built on Solr, where characters such as : / ( ) " have a special
// meaning. A stray one in what a visitor typed makes the whole search fail, so they are
// replaced with spaces. A leading "-" (which means "exclude this word") is removed too.
function cleanDataverseQuery(text) {
  return String(text || '')
    .replace(/&&|\|\||[\\+!(){}[\]^"~*?:/]/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapDataverseItem(it, doi) {
  if (!it || typeof it !== 'object') return null;
  if (it.type && it.type !== 'dataset') return null;
  if (typeof it.name !== 'string' || !it.name.trim()) return null;

  // global_id looks like "doi:10.7910/DVN/ABC123", or "hdl:1902.1/12345" for older deposits
  const globalId = typeof it.global_id === 'string' ? it.global_id.trim() : '';
  const itemDoi = /^doi:/i.test(globalId) ? normalizeDoi(globalId) : null;

  // Prefer the link Dataverse gives us. If it is missing or points somewhere we do not
  // allow (a Handle link, for example), fall back to links we build ourselves on hosts we
  // do allow: the DOI resolver, then the dataset's own page on Harvard Dataverse.
  let itemUrl = typeof it.url === 'string' && isSafeDatasetUrl(it.url.trim()) ? it.url.trim() : null;
  if (!itemUrl && itemDoi) {
    itemUrl = `https://doi.org/${itemDoi}`;
  }
  if (!itemUrl && /^(doi|hdl):\S+$/i.test(globalId)) {
    itemUrl = `https://dataverse.harvard.edu/dataset.xhtml?persistentId=${encodeURIComponent(globalId)}`;
  }

  // Strict relationship verification: a dataset on Dataverse can name the publication it
  // belongs to ("Related Publication"). Only an exact DOI match counts as a link.
  let hasVerifiedRel = false;
  if (doi && Array.isArray(it.publications)) {
    hasVerifiedRel = it.publications.some((pub) => pub && compareDois(pub.url, doi));
  }

  const fileCount = typeof it.fileCount === 'number' && it.fileCount >= 0 ? it.fileCount : null;
  const idPart = (globalId || it.name).replace(/[^a-zA-Z0-9]/g, '_');

  return {
    id: `dataverse_${idPart}`,
    title: it.name.trim(),
    url: itemUrl,
    doi: itemDoi,
    // "publisher" is the name of the collection inside Harvard Dataverse that released it
    publisher: (typeof it.publisher === 'string' && it.publisher.trim()) || (typeof it.name_of_dataverse === 'string' && it.name_of_dataverse.trim()) || 'Harvard Dataverse',
    publicationYear: yearFromDate(it.published_at),
    description: typeof it.description === 'string' && it.description.trim() ? it.description.replace(/<[^>]*>/g, '').slice(0, 300) : null,
    // The search result does not list file types, so none are claimed
    formats: [],
    // Nor a size in bytes. The number of files is the honest thing we can show.
    size: fileCount !== null && fileCount > 0 ? `${fileCount} ${fileCount === 1 ? 'file' : 'files'}` : null,
    // The licence is not part of the search result either
    license: 'Unknown / Not specified',
    isLinked: hasVerifiedRel,
    relationType: hasVerifiedRel ? 'Direct Supplemental Dataset' : 'Topic Similarity Discovery',
    relationshipDirection: hasVerifiedRel ? 'supplemental' : 'topic',
    relationEvidence: hasVerifiedRel
      ? 'Related publication declared in Harvard Dataverse metadata matches publication DOI.'
      : 'Discovered through search against Harvard Dataverse without verified relation.',
    source: 'Harvard Dataverse',
    sourceUrl: itemUrl,
    // Extra details that only this source has
    authors: cleanStringList(it.authors),
    subjects: cleanStringList(it.subjects),
    keywords: cleanStringList(it.keywords),
    fileCount,
    publishedAt: typeof it.published_at === 'string' ? it.published_at : null,
  };
}

/**
 * Searches Harvard Dataverse (strong in social science and replication data).
 * With keywords it is a normal search. With a DOI it looks for datasets that mention that
 * DOI, and marks a dataset as linked only when its "Related Publication" is that DOI.
 * Supports genuine pagination with page number and page size.
 */
async function queryDataverse({ query, doi, isLinked = false, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(size) || 5), 20);

    // A DOI is searched as an exact phrase (in quotes) so its "/" is not read as a command.
    let searchTerm = '';
    if (doi) {
      const cleanDoi = normalizeDoi(String(doi)) || String(doi).replace(/["\\\s]/g, '');
      searchTerm = cleanDoi ? `"${cleanDoi}"` : '';
    } else {
      searchTerm = cleanDataverseQuery(query);
    }
    if (!searchTerm) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    let data;
    if (process.env.OFFLINE_MODE === 'true') {
      // The saved response holds one page. Later pages are empty, like a real last page.
      const fixture = loadOfflineDatasetFixture('dataverseSearchResponse');
      const fixtureItems = fixture?.data?.items || [];
      data = {
        status: 'OK',
        data: { total_count: fixtureItems.length, items: pageNum === 1 ? fixtureItems.slice(0, pageSize) : [] },
      };
    } else {
      const start = (pageNum - 1) * pageSize;
      const url = `https://dataverse.harvard.edu/api/search?q=${encodeURIComponent(searchTerm)}&type=dataset&per_page=${pageSize}&start=${start}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json',
          'User-Agent': DATASET_USER_AGENT,
        },
      });

      // Harvard Dataverse sits behind a bot filter that can answer "202 Accepted" with a
      // browser challenge instead of data. That counts as "ok" in HTTP terms but it is
      // not a search result, so only a plain 200 is accepted.
      if (!res.ok || res.status !== 200) {
        return { records: [], totalCount: 0, hasMore: false, error: `Harvard Dataverse HTTP ${res.status}` };
      }

      data = await res.json();
    }

    if (!data || data.status !== 'OK' || !data.data) {
      return {
        records: [],
        totalCount: 0,
        hasMore: false,
        error: `Harvard Dataverse error: ${String((data && data.message) || 'unexpected response').slice(0, 120)}`,
      };
    }

    // Never keep more than we asked for, even if the server sends extra
    const items = (Array.isArray(data.data.items) ? data.data.items : []).slice(0, pageSize);
    const totalCount = typeof data.data.total_count === 'number' ? data.data.total_count : items.length;

    const mapped = items
      .map((it) => mapDataverseItem(it, doi))
      .filter((d) => d && d.url && isSafeDatasetUrl(d.url));

    return {
      records: mapped,
      totalCount,
      hasMore: totalCount > pageNum * pageSize,
      error: null,
    };
  } catch (err) {
    return { records: [], totalCount: 0, hasMore: false, error: err.message };
  }
}

/**
 * Reads the relation type of a ScholeXplorer link truthfully.
 * "Name" is one of a few broad words (IsSupplementedBy, References, IsRelatedTo...).
 * "SubType" sometimes carries the more exact original wording, so both are looked at.
 */
function evaluateScholixRelation(link) {
  const rel = link && typeof link.RelationshipType === 'object' && link.RelationshipType ? link.RelationshipType : {};
  const name = typeof rel.Name === 'string' ? rel.Name.trim() : '';
  const subType = typeof rel.SubType === 'string' ? rel.SubType.trim() : '';
  const simplify = (text) => text.toLowerCase().replace(/[^a-z]/g, '');
  const kinds = [simplify(name), simplify(subType)].filter(Boolean);
  const label = name && subType && simplify(name) !== simplify(subType) ? `${name} (${subType})` : name || subType || 'unspecified';

  const providers = cleanStringList(
    (Array.isArray(link && link.LinkProvider) ? link.LinkProvider : []).map((p) => p && (p.name || p.Name)),
    3
  );
  const reportedBy = providers.length > 0 ? ` reported by ${providers.join(', ')}` : '';

  if (kinds.some((k) => k === 'issupplementto' || k === 'issupplementedby')) {
    return {
      relationType: 'Direct Supplemental Dataset',
      relationshipDirection: 'supplemental',
      relationEvidence: `Scholix link '${label}'${reportedBy} (via OpenAIRE ScholeXplorer): Dataset is supplementary material of the publication.`,
      rank: 0,
    };
  }
  if (kinds.some((k) => k.includes('reference') || k.includes('cites') || k.includes('iscitedby'))) {
    return {
      relationType: 'Referenced Work / Citation',
      relationshipDirection: 'reference',
      relationEvidence: `Scholix link '${label}'${reportedBy} (via OpenAIRE ScholeXplorer): Publication cites this dataset (not verified supplemental data).`,
      rank: 1,
    };
  }
  return {
    relationType: 'Associated Resource',
    relationshipDirection: 'associated',
    relationEvidence: `Scholix link '${label}'${reportedBy} (via OpenAIRE ScholeXplorer): Declared link between publication and dataset.`,
    rank: 2,
  };
}

function mapScholixLink(link) {
  if (!link || typeof link !== 'object') return null;
  // The stable version of the API writes "target", the newer schema writes "Target".
  const target = link.target || link.Target;
  if (!target || typeof target !== 'object') return null;
  if (String(target.Type || '').toLowerCase() !== 'dataset') return null;

  const identifiers = Array.isArray(target.Identifier) ? target.Identifier : [];
  let itemDoi = null;
  for (const ident of identifiers) {
    if (ident && String(ident.IDScheme || '').toLowerCase() === 'doi') {
      itemDoi = normalizeDoi(String(ident.ID || ''));
      if (itemDoi) break;
    }
  }

  // With a DOI we build the link ourselves, so it always goes to the official DOI resolver.
  // Without one (database accession numbers, for example) we can only use the link that
  // came with the identifier, and the safety check below decides whether it is allowed.
  let itemUrl = itemDoi ? `https://doi.org/${itemDoi}` : null;
  if (!itemUrl) {
    const withUrl = identifiers.find((ident) => ident && typeof ident.IDURL === 'string' && ident.IDURL.trim());
    itemUrl = withUrl ? withUrl.IDURL.trim() : null;
  }
  if (!itemUrl) return null;

  const rel = evaluateScholixRelation(link);
  const publishers = Array.isArray(target.Publisher) ? target.Publisher : [];
  const creators = Array.isArray(target.Creator) ? target.Creator : [];
  const fallbackId = identifiers[0] && identifiers[0].ID ? String(identifiers[0].ID) : itemUrl;

  return {
    id: `scholexplorer_${(itemDoi || fallbackId).replace(/[^a-zA-Z0-9]/g, '_')}`,
    title: typeof target.Title === 'string' && target.Title.trim() ? target.Title.trim() : itemDoi ? `Dataset ${itemDoi}` : 'Linked Research Dataset',
    url: itemUrl,
    doi: itemDoi,
    publisher: cleanStringList(publishers.map((p) => p && (p.name || p.Name)), 1)[0] || 'Not specified',
    publicationYear: yearFromDate(target.PublicationDate),
    // A link record carries no description, formats, size or licence of the dataset
    description: null,
    formats: [],
    size: null,
    license: 'Unknown / Not specified',
    isLinked: true,
    relationType: rel.relationType,
    relationshipDirection: rel.relationshipDirection,
    relationEvidence: rel.relationEvidence,
    source: 'OpenAIRE ScholeXplorer',
    sourceUrl: itemUrl,
    // Extra details that only this source has
    authors: cleanStringList(creators.map((c) => c && (c.name || c.Name)), 10),
    linkProviders: cleanStringList((Array.isArray(link.LinkProvider) ? link.LinkProvider : []).map((p) => p && (p.name || p.Name)), 5),
    // Used only to put the strongest links first; removed before the record is returned
    relationRank: rel.rank,
  };
}

const SCHOLEXPLORER_DEFAULT_URL = 'https://api.scholexplorer.openaire.eu/v2/Links';

// The address can be changed with SCHOLEXPLORER_API_URL (for example to move to the v3
// service) without touching the code. Anything that is not an https address is ignored.
function getScholexplorerUrl() {
  const fromEnv = String(process.env.SCHOLEXPLORER_API_URL || '').trim();
  try {
    if (fromEnv && new URL(fromEnv).protocol === 'https:') return fromEnv;
  } catch (err) {
    // fall through to the default
  }
  return SCHOLEXPLORER_DEFAULT_URL;
}

/**
 * Asks OpenAIRE ScholeXplorer which datasets a paper is linked to.
 * ScholeXplorer collects "this paper uses / cites / is supplemented by that dataset"
 * statements from Crossref, DataCite, EMBL-EBI and others. It works from the paper's DOI
 * only, so it is used when enriching one paper and never for keyword search.
 * Every record it returns is a declared link, so isLinked is always true.
 */
async function queryScholexplorer({ query, doi, isLinked = true, page = 1, size = 5 }) {
  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(size) || 5), 20);
    const cleanDoi = normalizeDoi(typeof doi === 'string' ? doi : '');
    if (!cleanDoi) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    let data;
    if (process.env.OFFLINE_MODE === 'true') {
      data = (pageNum === 1 && loadOfflineDatasetFixture('scholexplorerLinksResponse')) || { result: [] };
    } else {
      const endpoint = new URL(getScholexplorerUrl());
      endpoint.searchParams.set('sourcePid', cleanDoi);
      // Ask only for links that end at a dataset. A well-cited paper has hundreds of links
      // to other papers, and its few dataset links would otherwise be lost among them.
      endpoint.searchParams.set('targetType', 'dataset');
      // ScholeXplorer counts pages from 0
      if (pageNum > 1) endpoint.searchParams.set('page', String(pageNum - 1));

      const res = await fetch(endpoint.toString(), {
        signal: AbortSignal.timeout(5000),
        headers: {
          Accept: 'application/json',
          'User-Agent': DATASET_USER_AGENT,
        },
      });

      if (!res.ok) {
        return { records: [], totalCount: 0, hasMore: false, error: `OpenAIRE ScholeXplorer HTTP ${res.status}` };
      }

      data = await res.json();
    }

    const links = Array.isArray(data && data.result) ? data.result : [];

    // The same dataset is often reported several times (by different link providers, or
    // once as "supplement" and once as "related"). Put the strongest relation first and
    // keep one record per dataset.
    const seen = new Set();
    const mapped = links
      .map(mapScholixLink)
      .filter((d) => d && d.url && isSafeDatasetUrl(d.url))
      .sort((a, b) => a.relationRank - b.relationRank)
      .filter((d) => {
        const key = (d.doi || d.url).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, pageSize)
      .map(({ relationRank, ...record }) => record);

    return {
      records: mapped,
      totalCount: typeof data.totalLinks === 'number' ? data.totalLinks : mapped.length,
      hasMore: typeof data.totalPages === 'number' ? data.totalPages > pageNum : false,
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
  // Every provider we actually sent a question to, so we can tell "all of them failed"
  // apart from "some failed"
  const askedProviders = new Set();

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
    // All of these run at the same time, each with its own 5 second limit, so adding a
    // source does not make the visitor wait longer.
    const [dcLinkedRes, zenodoLinkedRes, figshareLinkedRes, dryadLinkedRes, dataverseLinkedRes, scholixLinkedRes] = await Promise.all([
      queryDataCite({ doi, isLinked: true, page: 1, size: 5 }),
      queryZenodo({ doi, isLinked: true, page: 1, size: 5 }),
      queryFigshare({ doi, isLinked: true, page: 1, size: 5 }),
      queryDryad({ doi, isLinked: true, page: 1, size: 5 }),
      queryDataverse({ doi, isLinked: true, page: 1, size: 5 }),
      queryScholexplorer({ doi, isLinked: true, page: 1, size: 5 }),
    ]);
    for (const name of ['DataCite', 'Zenodo', 'Figshare', 'Dryad', 'Harvard Dataverse', 'OpenAIRE ScholeXplorer']) {
      askedProviders.add(name);
    }

    if (dcLinkedRes.error) providerErrors.DataCite = dcLinkedRes.error;
    if (zenodoLinkedRes.error) providerErrors.Zenodo = zenodoLinkedRes.error;
    if (figshareLinkedRes.error) providerErrors.Figshare = figshareLinkedRes.error;
    if (dryadLinkedRes.error) providerErrors.Dryad = dryadLinkedRes.error;
    if (dataverseLinkedRes.error) providerErrors['Harvard Dataverse'] = dataverseLinkedRes.error;
    if (scholixLinkedRes.error) providerErrors['OpenAIRE ScholeXplorer'] = scholixLinkedRes.error;

    for (const d of [
      ...dcLinkedRes.records,
      ...zenodoLinkedRes.records,
      ...figshareLinkedRes.records,
      ...dryadLinkedRes.records,
      ...dataverseLinkedRes.records,
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

    // ScholeXplorer is handled on its own because every record it returns is a declared
    // link between this exact paper and a dataset (not a keyword guess), so it always
    // belongs under "linked", whatever the relation is called.
    for (const d of scholixLinkedRes.records) {
      const dKey = d.doi ? d.doi.toLowerCase() : d.url.toLowerCase();
      if (!seenDois.has(dKey) && !seenUrls.has(d.url.toLowerCase())) {
        if (d.doi) seenDois.add(d.doi.toLowerCase());
        seenUrls.add(d.url.toLowerCase());
        d.isLinked = true;
        linkedDatasets.push(d);
        continue;
      }

      // Another source already returned this dataset. Keep that record (it has the
      // description, formats and licence that a link record lacks), but if it was filed
      // under "related", move it up to "linked": we now know the link is real.
      const relatedIndex = relatedDatasets.findIndex(
        (r) => (d.doi && r.doi && r.doi.toLowerCase() === d.doi.toLowerCase()) || r.url.toLowerCase() === d.url.toLowerCase()
      );
      if (relatedIndex !== -1) {
        const [existing] = relatedDatasets.splice(relatedIndex, 1);
        existing.isLinked = true;
        if (existing.relationshipDirection === 'topic') {
          // It was only a keyword match before. Replace that with the declared relation.
          existing.relationType = d.relationType;
          existing.relationshipDirection = d.relationshipDirection;
          existing.relationEvidence = d.relationEvidence;
        }
        linkedDatasets.push(existing);
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
      // Hugging Face is left out here on purpose: its search only finds datasets whose
      // name contains every word, and words taken from a paper title almost never do.
      const [dcRelatedRes, zenodoRelatedRes, figshareRelatedRes, dryadRelatedRes, dataverseRelatedRes] = await Promise.all([
        queryDataCite({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryZenodo({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryFigshare({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryDryad({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
        queryDataverse({ query: cleanWords, isLinked: false, page: 1, size: 3 }),
      ]);
      for (const name of ['DataCite', 'Zenodo', 'Figshare', 'Dryad', 'Harvard Dataverse']) {
        askedProviders.add(name);
      }

      if (dcRelatedRes.error && !providerErrors.DataCite) providerErrors.DataCite = dcRelatedRes.error;
      if (zenodoRelatedRes.error && !providerErrors.Zenodo) providerErrors.Zenodo = zenodoRelatedRes.error;
      if (figshareRelatedRes.error && !providerErrors.Figshare) providerErrors.Figshare = figshareRelatedRes.error;
      if (dryadRelatedRes.error && !providerErrors.Dryad) providerErrors.Dryad = dryadRelatedRes.error;
      if (dataverseRelatedRes.error && !providerErrors['Harvard Dataverse']) providerErrors['Harvard Dataverse'] = dataverseRelatedRes.error;

      for (const d of [
        ...dcRelatedRes.records,
        ...zenodoRelatedRes.records,
        ...figshareRelatedRes.records,
        ...dryadRelatedRes.records,
        ...dataverseRelatedRes.records,
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

  // An outage means every provider we asked failed. (With four providers this used to be
  // written as "4 errors". It is counted against the real list now, so that one of the
  // newer sources answering is enough to not call it an outage.)
  const hasOutage = askedProviders.size > 0 && [...askedProviders].every((name) => Boolean(providerErrors[name]));

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
 * Searches across official open science data repositories (DataCite, Zenodo, Figshare, Dryad,
 * Harvard Dataverse, Hugging Face)
 * Genuine page-based pagination with provider cursor forwarding.
 * (OpenAIRE ScholeXplorer is not here: it answers "which datasets belong to this paper",
 * not keyword searches.)
 */
async function searchGlobalDatasets({ query = '', page = 1, limit = 15 }) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(30, Math.max(5, parseInt(limit) || 15));
  const cleanQ = (query || 'research dataset').trim();

  const cacheKey = `search_${cleanQ}_${pageNum}_${limitNum}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Each source is asked for a quarter of the page, exactly as when there were four
  // sources. The two newer sources get the same amount on top, so the original four return
  // what they always did and a page can only get fuller, never thinner, if a newer source
  // has nothing or is down. All sources are asked at the same time, each with its own
  // 5 second limit, so the wait does not grow with the number of sources.
  const SEARCH_PROVIDER_COUNT = 6;
  const quarterLimit = Math.max(2, Math.ceil(limitNum / 4));
  const [dcRes, zenodoRes, figshareRes, dryadRes, dataverseRes, huggingFaceRes] = await Promise.all([
    queryDataCite({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryZenodo({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryFigshare({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryDryad({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryDataverse({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
    queryHuggingFace({ query: cleanQ, isLinked: false, page: pageNum, size: quarterLimit }),
  ]);

  const providerErrors = {};
  if (dcRes.error) providerErrors.DataCite = dcRes.error;
  if (zenodoRes.error) providerErrors.Zenodo = zenodoRes.error;
  if (figshareRes.error) providerErrors.Figshare = figshareRes.error;
  if (dryadRes.error) providerErrors.Dryad = dryadRes.error;
  if (dataverseRes.error) providerErrors['Harvard Dataverse'] = dataverseRes.error;
  if (huggingFaceRes.error) providerErrors['Hugging Face'] = huggingFaceRes.error;

  const combined = [];
  const seenDois = new Set();
  const seenUrls = new Set();

  for (const d of [
    ...dcRes.records,
    ...zenodoRes.records,
    ...figshareRes.records,
    ...dryadRes.records,
    ...dataverseRes.records,
    ...huggingFaceRes.records,
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
      dataverseRes.hasMore ||
      huggingFaceRes.hasMore ||
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
    // An outage means every one of the sources failed
    hasOutage: Object.keys(providerErrors).length >= SEARCH_PROVIDER_COUNT,
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
  queryDataverse,
  queryHuggingFace,
  queryScholexplorer,
  enrichPaperDatasets,
  searchGlobalDatasets,
};
