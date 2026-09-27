const { createNormalizedRecord } = require('../scholarlyRecord');

async function searchDoaj({ query = '', page = 1, limit = 20, filters = {}, sort = 'relevance' }) {
  try {
    if (process.env.OFFLINE_MODE === 'true') {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    // DOAJ contains only peer-reviewed journals, not dissertations/theses
    if (filters.publicationType && (filters.publicationType === 'thesis' || filters.publicationType === 'preprint')) {
      return { records: [], totalCount: 0, hasMore: false, error: null };
    }

    const cleanQ = (query || 'research').trim();
    const pageSize = Math.min(limit, 30);
    const sortParam = sort === 'newest' ? '&sort=created_date:desc' : '';
    const url = `https://doaj.org/api/v2/search/articles/${encodeURIComponent(cleanQ)}?pageSize=${pageSize}&page=${page}${sortParam}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `DOAJ status: ${res.status}` };
    }

    const data = await res.json();
    const items = data.results || [];
    const totalCount = data.total || items.length;
    const hasMore = page * pageSize < totalCount;

    const records = items.map((item) => {
      const bib = item.bibjson || {};
      const title = bib.title || 'DOAJ Journal Article';

      let authors = [];
      if (Array.isArray(bib.author)) {
        authors = bib.author.map((a) => ({ name: (a.name || '').trim(), affiliation: a.affiliation || null })).filter((a) => a.name);
      }

      const doiObj = (bib.identifier || []).find((i) => i.type === 'doi');
      const doi = doiObj ? doiObj.id.toLowerCase() : null;

      let directPdfUrl = null;
      let landingUrl = null;
      const fullTextLocations = [];

      if (Array.isArray(bib.link)) {
        for (const l of bib.link) {
          if (!l.url) continue;
          let isPdf = l.type === 'fulltext' && (l.content_type === 'application/pdf' || l.url.endsWith('.pdf') || l.url.includes('/pdf/'));
          let url = l.url;
          if (url.includes('mdpi.com/') && !url.endsWith('/pdf')) {
            url = url + '/pdf';
            isPdf = true;
          }
          if (isPdf && !directPdfUrl) directPdfUrl = url;
          if (!landingUrl) landingUrl = url;

          fullTextLocations.push({
            type: isPdf ? 'pdf' : 'landing',
            url: url,
            source: 'DOAJ Open Access Link',
            isDirectPdf: isPdf,
          });
        }
      }

      if (filters.hasPdf && !directPdfUrl) return null;

      const pubYear = bib.year ? parseInt(bib.year) : null;
      if (filters.yearMin && pubYear && pubYear < parseInt(filters.yearMin)) return null;
      if (filters.yearMax && pubYear && pubYear > parseInt(filters.yearMax)) return null;

      const journalTitle = bib.journal?.title || null;
      const publisher = bib.journal?.publisher || journalTitle || 'DOAJ Open Access Publishing';
      const rawCategory = (Array.isArray(bib.subject) ? bib.subject.map((s) => s.term).join(' ') : '') ||
        (Array.isArray(bib.keywords) ? bib.keywords.join(' ') : null);

      return createNormalizedRecord({
        id: `doaj_${item.id}`,
        doi: doi,
        title: title,
        authors: authors,
        abstract: bib.abstract || null,
        category: rawCategory,
        publicationType: 'journal-article',
        isPeerReviewed: true, // All DOAJ articles are peer-reviewed
        publishedYear: pubYear,
        venue: journalTitle,
        publisher: publisher,
        isOpenAccess: true,
        pdfUrl: directPdfUrl,
        isDirectPdf: Boolean(directPdfUrl),
        fullTextUrl: landingUrl || (doi ? `https://doi.org/${doi}` : null),
        fullTextLocations: fullTextLocations,
        source: 'DOAJ',
        catalogId: `DOAJ:${item.id}`,
      });
    }).filter(Boolean);

    return {
      records,
      rawCount: items.length,
      totalCount,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('DOAJ adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchDoaj };
