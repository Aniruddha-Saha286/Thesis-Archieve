const { createNormalizedRecord } = require('../scholarlyRecord');

/**
 * Semantic Scholar Graph API Provider Adapter
 * Endpoint: https://api.semanticscholar.org/graph/v1/paper/search
 */
async function searchSemanticScholar({
  query = '',
  page = 1,
  limit = 20,
  offset: explicitOffset = null,
  filters = {},
  sort = 'relevance',
}) {
  const offset = typeof explicitOffset === 'number' ? explicitOffset : (page - 1) * limit;
  const cleanQ = (query || 'research').trim();
  const pageSize = Math.min(limit, 30);

  if (process.env.OFFLINE_MODE === 'true') {
    // If query is specifically checking offline fixtures
    const count = Math.min(pageSize, 2);
    const records = [];
    for (let i = 0; i < count; i++) {
      const idx = offset + i + 1;
      records.push(
        createNormalizedRecord({
          id: `s2_offline_${idx}`,
          doi: `10.1000/s2.offline.${idx}`,
          title: `Semantic Scholar Research Publication ${idx} on ${cleanQ}`,
          authors: [{ name: `Author S2 ${idx}`, affiliation: null }],
          abstract: `Abstract for Semantic Scholar paper ${idx}`,
          publicationType: 'journal-article',
          isPeerReviewed: true,
          publishedYear: 2024,
          venue: 'Journal of Academic Research',
          publisher: null,
          isOpenAccess: true,
          pdfUrl: `https://example.org/pdf/s2_${idx}.pdf`,
          isDirectPdf: true,
          fullTextUrl: `https://example.org/pdf/s2_${idx}.pdf`,
          fullTextLocations: [
            {
              type: 'pdf',
              url: `https://example.org/pdf/s2_${idx}.pdf`,
              source: 'Semantic Scholar Open Access PDF',
              isDirectPdf: true,
            },
          ],
          citationCount: 42 + idx,
          citationSource: 'Semantic Scholar',
          source: 'Semantic Scholar',
          catalogId: `S2:offline_${idx}`,
        })
      );
    }
    return {
      records,
      rawCount: records.length,
      totalCount: 100,
      hasMore: offset + records.length < 100,
      nextOffset: offset + records.length,
      nextPage: page + 1,
      error: null,
    };
  }

  const params = new URLSearchParams();
  params.append('query', cleanQ);
  params.append('offset', String(offset));
  params.append('limit', String(pageSize));
  params.append(
    'fields',
    'paperId,title,abstract,authors,year,venue,publicationTypes,publicationDate,externalIds,openAccessPdf,citationCount,isOpenAccess'
  );

  // Year range filter support
  if (filters.yearMin && filters.yearMax) {
    params.append('year', `${filters.yearMin}-${filters.yearMax}`);
  } else if (filters.yearMin) {
    params.append('year', `${filters.yearMin}-`);
  } else if (filters.yearMax) {
    params.append('year', `-${filters.yearMax}`);
  }

  // Publication type mapping
  if (filters.publicationType) {
    if (filters.publicationType === 'journal-article') {
      params.append('publicationTypes', 'JournalArticle');
    } else if (filters.publicationType === 'conference-paper') {
      params.append('publicationTypes', 'Conference');
    } else if (filters.publicationType === 'book') {
      params.append('publicationTypes', 'Book');
    }
  }

  if (filters.hasPdf) {
    params.append('openAccessPdf', '');
  }

  const headers = {
    'User-Agent': 'ThesisArchive/1.0 (academic open research; contact@thesisarchive.org)',
  };
  if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
    headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
  }

  const url = `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`;

  async function executeFetch(isRetry = false) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers,
      });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;

        // At most ONE safe retry if retry-after is very small (<= 2 seconds)
        if (!isRetry && retryAfterSec > 0 && retryAfterSec <= 2) {
          await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
          return executeFetch(true);
        }

        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: 'Semantic Scholar rate limit reached',
        };
      }

      if (res.status === 401) {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: 'Semantic Scholar authentication failed (401)',
        };
      }

      if (res.status === 403) {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: 'Semantic Scholar access forbidden (403)',
        };
      }

      if (res.status >= 500) {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: `Semantic Scholar service error (${res.status})`,
        };
      }

      if (!res.ok) {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: `Semantic Scholar HTTP ${res.status}`,
        };
      }

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: 'Semantic Scholar returned malformed response',
        };
      }

      const items = Array.isArray(data?.data) ? data.data : [];
      const totalCount = typeof data?.total === 'number' ? data.total : items.length;
      const hasMore = offset + items.length < totalCount;

      const records = items
        .map((item) => {
          if (!item || !item.title) return null;

          const title = item.title.trim();
          const doi = item.externalIds?.DOI ? item.externalIds.DOI.toLowerCase().trim() : null;

          const authors = (item.authors || [])
            .map((a) => ({
              name: (a.name || '').trim(),
              affiliation: null,
            }))
            .filter((a) => a.name);

          const publishedYear =
            item.year ||
            (item.publicationDate ? new Date(item.publicationDate).getFullYear() : null);

          let pubType = 'journal-article';
          if (Array.isArray(item.publicationTypes)) {
            if (item.publicationTypes.some((t) => /thesis|dissertation/i.test(t))) {
              pubType = 'thesis';
            } else if (item.publicationTypes.some((t) => /conference/i.test(t))) {
              pubType = 'conference-paper';
            } else if (item.publicationTypes.some((t) => /preprint/i.test(t))) {
              pubType = 'preprint';
            } else if (item.publicationTypes.some((t) => /book/i.test(t))) {
              pubType = 'book';
            }
          }

          const directPdfUrl = item.openAccessPdf?.url || null;

          if (filters.hasPdf && !directPdfUrl) return null;

          const fullTextLocations = [];
          if (directPdfUrl) {
            fullTextLocations.push({
              type: 'pdf',
              url: directPdfUrl,
              source: 'Semantic Scholar Open Access PDF',
              isDirectPdf: true,
            });
          }
          if (doi) {
            fullTextLocations.push({
              type: 'landing',
              url: `https://doi.org/${doi}`,
              source: 'Publisher DOI Landing Page',
              isDirectPdf: false,
            });
          }
          if (item.paperId) {
            fullTextLocations.push({
              type: 'landing',
              url: `https://www.semanticscholar.org/paper/${item.paperId}`,
              source: 'Semantic Scholar Entry',
              isDirectPdf: false,
            });
          }

          const citationCount =
            typeof item.citationCount === 'number' ? item.citationCount : null;

          return createNormalizedRecord({
            id: `s2_${item.paperId || (doi ? doi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7))}`,
            doi,
            title,
            authors,
            abstract: item.abstract ? item.abstract.trim() : null,
            publicationType: pubType,
            isPeerReviewed: pubType === 'journal-article' || pubType === 'conference-paper',
            publishedYear,
            venue: item.venue || null,
            publisher: null,
            isOpenAccess: Boolean(item.isOpenAccess || directPdfUrl),
            pdfUrl: directPdfUrl,
            isDirectPdf: Boolean(directPdfUrl),
            fullTextUrl: directPdfUrl || (doi ? `https://doi.org/${doi}` : null),
            fullTextLocations,
            citationCount,
            citationSource: 'Semantic Scholar',
            source: 'Semantic Scholar',
            catalogId: item.paperId ? `S2:${item.paperId}` : (doi ? `DOI:${doi}` : null),
          });
        })
        .filter(Boolean);

      return {
        records,
        rawCount: items.length,
        totalCount,
        hasMore,
        nextOffset: offset + items.length,
        nextPage: hasMore ? page + 1 : null,
        error: null,
      };
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return {
          records: [],
          rawCount: 0,
          totalCount: 0,
          hasMore: false,
          error: 'Semantic Scholar request timed out',
        };
      }
      return {
        records: [],
        rawCount: 0,
        totalCount: 0,
        hasMore: false,
        error: `Semantic Scholar network error: ${err.message}`,
      };
    }
  }

  return executeFetch(false);
}

module.exports = { searchSemanticScholar };
