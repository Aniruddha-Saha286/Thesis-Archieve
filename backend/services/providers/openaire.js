const { createNormalizedRecord } = require('../scholarlyRecord');

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * OpenAIRE Graph API V3 Provider Adapter
 * Endpoint: https://api.openaire.eu/graph/v3/research-products
 */
async function searchOpenAire({
  query = '',
  page = 1,
  limit = 20,
  filters = {},
  sort = 'relevance',
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(limit, 30);
  const cleanQ = (query || 'research').trim();

  if (process.env.OFFLINE_MODE === 'true') {
    const records = [];
    const count = Math.min(pageSize, 2);
    for (let i = 0; i < count; i++) {
      const idx = (pageNum - 1) * pageSize + i + 1;
      records.push(
        createNormalizedRecord({
          id: `openaire_offline_${idx}`,
          doi: `10.1000/openaire.offline.${idx}`,
          title: `OpenAIRE Graph V3 Publication ${idx} on ${cleanQ}`,
          authors: [{ name: `Researcher OpenAIRE ${idx}`, affiliation: null }],
          abstract: `Abstract for OpenAIRE research product ${idx}`,
          publicationType: 'journal-article',
          isPeerReviewed: true,
          publishedYear: 2024,
          venue: null,
          publisher: 'European Open Science',
          isOpenAccess: true,
          pdfUrl: `https://example.org/pdf/openaire_${idx}.pdf`,
          isDirectPdf: true,
          fullTextUrl: `https://example.org/pdf/openaire_${idx}.pdf`,
          fullTextLocations: [
            {
              type: 'pdf',
              url: `https://example.org/pdf/openaire_${idx}.pdf`,
              source: 'OpenAIRE Fulltext PDF',
              isDirectPdf: true,
            },
          ],
          source: 'OpenAIRE',
          catalogId: `OpenAIRE:offline_${idx}`,
        })
      );
    }
    return {
      records,
      rawCount: records.length,
      totalCount: 100,
      hasMore: pageNum * pageSize < 100,
      nextPage: pageNum + 1,
      error: null,
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('search', cleanQ);
    params.append('type', 'publication');
    params.append('page', String(pageNum));
    params.append('pageSize', String(pageSize));

    // OpenAIRE Graph V3 requires quoted value for accessRightLabel with spaces
    if (filters.isOpenAccess || filters.hasPdf) {
      params.append('accessRightLabel', '"Open Access"');
    }

    if (filters.yearMin) {
      params.append('fromPublicationYear', String(filters.yearMin));
    }
    if (filters.yearMax) {
      params.append('toPublicationYear', String(filters.yearMax));
    }

    if (filters.isPeerReviewed) {
      params.append('isPeerReviewed', 'true');
    }

    const url = `https://api.openaire.eu/graph/v3/research-products?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
        Accept: 'application/json',
      },
    });

    if (res.status === 429) {
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: 'OpenAIRE rate limit reached',
      };
    }

    if (res.status >= 500) {
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: `OpenAIRE service error (${res.status})`,
      };
    }

    if (!res.ok) {
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: `OpenAIRE HTTP ${res.status}`,
      };
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: 'OpenAIRE returned malformed response',
      };
    }

    const items = Array.isArray(data?.results) ? data.results : [];
    const totalCount =
      typeof data?.header?.numFound === 'number'
        ? data.header.numFound
        : items.length;
    const hasMore = pageNum * pageSize < totalCount;

    const records = items
      .map((item) => {
        if (!item) return null;

        const rawTitle = item.mainTitle || 'OpenAIRE Scholarly Publication';
        const title = decodeHtmlEntities(rawTitle.trim());

        // Extract DOI from pids array
        let doi = null;
        if (Array.isArray(item.pids)) {
          const doiObj = item.pids.find(
            (p) => (p?.scheme || '').toLowerCase() === 'doi'
          );
          if (doiObj?.value) {
            doi = doiObj.value.toLowerCase().trim();
          }
        }

        // Instances for URLs and direct PDFs
        let directPdfUrl = null;
        const fullTextLocations = [];
        const instanceTypes = [];

        if (Array.isArray(item.instances)) {
          for (const inst of item.instances) {
            if (inst.type) instanceTypes.push(String(inst.type));
            const urls = Array.isArray(inst.urls)
              ? inst.urls
              : typeof inst.urls === 'string'
              ? [inst.urls]
              : [];

            for (const u of urls) {
              if (typeof u === 'string' && u.startsWith('http')) {
                const isPdf =
                  /\.pdf(\?|$|#)/i.test(u) ||
                  u.includes('/pdf/') ||
                  u.includes('application/pdf');

                if (isPdf && !directPdfUrl) {
                  directPdfUrl = u;
                  fullTextLocations.push({
                    type: 'pdf',
                    url: u,
                    source: 'OpenAIRE Fulltext PDF',
                    isDirectPdf: true,
                  });
                } else if (!isPdf) {
                  fullTextLocations.push({
                    type: 'landing',
                    url: u,
                    source: inst.hostedBy?.value || 'OpenAIRE Repository Instance',
                    isDirectPdf: false,
                  });
                }
              }
            }
          }
        }

        if (filters.hasPdf && !directPdfUrl) return null;

        if (doi) {
          fullTextLocations.push({
            type: 'landing',
            url: `https://doi.org/${doi}`,
            source: 'Publisher DOI Landing Page',
            isDirectPdf: false,
          });
        }

        if (item.id) {
          fullTextLocations.push({
            type: 'landing',
            url: `https://explore.openaire.eu/search/publication?pid=${encodeURIComponent(item.id)}`,
            source: 'OpenAIRE Explore Entry',
            isDirectPdf: false,
          });
        }

        // Authors
        const authors = (item.authors || [])
          .map((a) => {
            const name = (
              a.fullName || `${a.name || ''} ${a.surname || ''}`
            ).trim();
            return { name, affiliation: null };
          })
          .filter((a) => a.name);

        // Date / Published Year
        const publishedYear = item.publicationDate
          ? new Date(item.publicationDate).getFullYear() || null
          : null;

        // Open Access
        const accessLabel = (item.bestAccessRight?.label || '').toUpperCase();
        const isOpenAccess =
          accessLabel === 'OPEN' ||
          accessLabel === 'OPEN ACCESS' ||
          Boolean(directPdfUrl);

        // Publication Type
        const instTypeStr = instanceTypes.join(' ').toLowerCase();
        let pubType = 'journal-article';
        if (instTypeStr.includes('thesis') || instTypeStr.includes('dissertation')) {
          pubType = 'thesis';
        } else if (
          instTypeStr.includes('proceeding') ||
          instTypeStr.includes('conference')
        ) {
          pubType = 'conference-paper';
        } else if (instTypeStr.includes('preprint')) {
          pubType = 'preprint';
        } else if (
          instTypeStr.includes('book') ||
          instTypeStr.includes('monograph')
        ) {
          pubType = 'book';
        }

        // Abstract / Description
        let rawDesc = null;
        if (Array.isArray(item.descriptions) && item.descriptions.length > 0) {
          rawDesc = item.descriptions[0];
        } else if (typeof item.descriptions === 'string') {
          rawDesc = item.descriptions;
        }

        let abstract = null;
        if (rawDesc) {
          abstract = decodeHtmlEntities(rawDesc.replace(/<[^>]*>/g, '').trim());
        }

        return createNormalizedRecord({
          id: `openaire_${item.id ? item.id.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7)}`,
          doi,
          title,
          authors,
          abstract,
          publicationType: pubType,
          isPeerReviewed:
            pubType === 'journal-article' || pubType === 'conference-paper',
          publishedYear,
          venue: item.container?.name || null,
          publisher: item.publisher || null,
          isOpenAccess,
          pdfUrl: directPdfUrl,
          isDirectPdf: Boolean(directPdfUrl),
          fullTextUrl: directPdfUrl || (doi ? `https://doi.org/${doi}` : null),
          fullTextLocations,
          source: 'OpenAIRE',
          catalogId: item.id ? `OpenAIRE:${item.id}` : (doi ? `DOI:${doi}` : null),
        });
      })
      .filter(Boolean);

    return {
      records,
      rawCount: items.length,
      totalCount,
      hasMore,
      nextPage: hasMore ? pageNum + 1 : null,
      error: null,
    };
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: 'OpenAIRE request timed out',
      };
    }
    return {
      records: [],
      rawCount: 0,
      totalCount: 0,
      hasMore: false,
      error: `OpenAIRE network error: ${err.message}`,
    };
  }
}

module.exports = { searchOpenAire };
