const { createNormalizedRecord } = require('../scholarlyRecord');

// In-memory cursor cache for Europe PMC deep pagination
const cursorCache = new Map();

async function searchEuropePmc({ query = '', page = 1, limit = 20, filters = {}, sort = 'relevance' }) {
  try {
    if (process.env.OFFLINE_MODE === 'true') {
      return { records: [], totalCount: 0, rawCount: 0, hasMore: false, error: null };
    }

    let cleanQ = (query || 'research').trim();

    // Query builder
    const queryParts = [cleanQ];
    if (filters.hasPdf || filters.isOpenAccess) {
      queryParts.push('OPEN_ACCESS:y');
    }
    if (filters.publicationType === 'preprint') {
      queryParts.push('SRC:PPR');
    }

    const sortParam = sort === 'newest' ? '&sort=P_PD_D%20desc' : '';
    const pageSize = Math.min(limit, 35);
    const queryString = queryParts.join(' AND ');
    const cacheKey = [queryString, sortParam, pageSize].join('|');

    if (!cursorCache.has(cacheKey)) {
      cursorCache.set(cacheKey, { 1: '*' });
    }
    const cursors = cursorCache.get(cacheKey);

    const targetPage = Math.max(1, parseInt(page) || 1);
    let currentCursor = cursors[targetPage];

    // If cursor for this page isn't cached yet, walk forward from the nearest known cursor
    if (!currentCursor) {
      const knownPages = Object.keys(cursors).map(Number).filter((p) => p <= targetPage).sort((a, b) => a - b);
      let curPage = knownPages[knownPages.length - 1] || 1;
      currentCursor = cursors[curPage] || '*';

      while (curPage < targetPage) {
        const stepUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(queryString)}&format=json&pageSize=${pageSize}&cursorMark=${encodeURIComponent(currentCursor)}${sortParam}`;
        const stepRes = await fetch(stepUrl, {
          signal: AbortSignal.timeout(6500),
          headers: { 'User-Agent': 'ThesisArchive/1.0 (academic open research)' },
        });
        if (!stepRes.ok) break;
        const stepData = await stepRes.json();
        if (!stepData.nextCursorMark || stepData.nextCursorMark === currentCursor) break;
        curPage++;
        currentCursor = stepData.nextCursorMark;
        cursors[curPage] = currentCursor;
      }
    }

    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(queryString)}&format=json&pageSize=${pageSize}&cursorMark=${encodeURIComponent(currentCursor || '*')}${sortParam}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `Europe PMC API status: ${res.status}` };
    }

    const data = await res.json();
    const items = data.resultList?.result || [];
    const totalCount = data.hitCount || items.length;
    const hasMore = Boolean(data.nextCursorMark && data.nextCursorMark !== currentCursor);

    // Cache the next cursor mark for the subsequent page
    if (data.nextCursorMark && data.nextCursorMark !== currentCursor) {
      cursors[targetPage + 1] = data.nextCursorMark;
    }

    const records = items.map((it) => {
      const doi = it.doi ? it.doi.toLowerCase() : null;
      const cleanTitle = (it.title || 'Biomedical & Life Sciences Investigation').replace(/\s+/g, ' ').replace(/\.$/, '').trim();

      // Extract authors
      let authors = [];
      if (it.authorString) {
        authors = it.authorString.split(/,| and /i).map((n) => ({ name: n.trim(), affiliation: null })).filter((a) => a.name);
      }

      // Authentic direct PDF handling via NCBI PubMed Central
      let directPdfUrl = null;
      const fullTextLocations = [];

      if (it.pmcid) {
        directPdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${it.pmcid}/pdf/`;
        fullTextLocations.push({
          type: 'pdf',
          url: directPdfUrl,
          source: 'PubMed Central (NIH)',
          isDirectPdf: true,
        });
        fullTextLocations.push({
          type: 'html',
          url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${it.pmcid}/`,
          source: 'PubMed Central Article Page',
          isDirectPdf: false,
        });
      }

      if (it.fullTextUrlList?.fullTextUrl) {
        const urlArray = Array.isArray(it.fullTextUrlList.fullTextUrl) ? it.fullTextUrlList.fullTextUrl : [it.fullTextUrlList.fullTextUrl];
        for (const u of urlArray) {
          if (u.url && !fullTextLocations.some((l) => l.url === u.url)) {
            const isPdf = u.documentStyle === 'pdf' || u.url.endsWith('.pdf');
            if (isPdf && !directPdfUrl) directPdfUrl = u.url;
            fullTextLocations.push({
              type: isPdf ? 'pdf' : 'landing',
              url: u.url,
              source: u.availability || 'Europe PMC Full Text',
              isDirectPdf: isPdf,
            });
          }
        }
      }

      if (filters.hasPdf && !directPdfUrl) return null;

      const currentYear = new Date().getFullYear();
      let pubYear = it.pubYear ? parseInt(it.pubYear) : null;
      if (pubYear && pubYear > currentYear + 1) {
        pubYear = currentYear;
      }
      if (filters.yearMin && pubYear && pubYear < parseInt(filters.yearMin)) return null;
      if (filters.yearMax && pubYear && pubYear > parseInt(filters.yearMax)) return null;

      const isRetracted = it.isRetracted === 'Y';
      const citationCount = typeof it.citedByCount === 'number' ? it.citedByCount : null;
      const venue = it.journalInfo?.journal?.title || it.journalTitle || null;

      let pubType = 'journal-article';
      if (it.source === 'PPR') pubType = 'preprint';

      return createNormalizedRecord({
        id: `epmc_${it.id}`,
        doi: doi,
        title: cleanTitle,
        authors: authors,
        abstract: it.abstractText ? it.abstractText.replace(/<[^>]*>/g, '').trim() : null,
        publicationType: pubType,
        isPeerReviewed: pubType === 'journal-article',
        publishedYear: pubYear,
        venue: venue,
        publisher: venue || 'Europe PMC / EMBL-EBI',
        isOpenAccess: Boolean(it.isOpenAccess === 'Y' || directPdfUrl),
        pdfUrl: directPdfUrl,
        isDirectPdf: Boolean(directPdfUrl),
        fullTextUrl: it.pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${it.pmcid}/` : (doi ? `https://doi.org/${doi}` : null),
        fullTextLocations: fullTextLocations,
        isRetracted: isRetracted,
        citationCount: citationCount,
        citationSource: 'Europe PMC',
        source: 'Europe PMC',
        catalogId: it.pmcid ? `PMC:${it.pmcid}` : `PMID:${it.id}`,
      });
    }).filter(Boolean);

    return {
      records,
      rawCount: items.length,
      totalCount,
      hasMore,
      nextPage: hasMore ? targetPage + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('Europe PMC adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchEuropePmc };
