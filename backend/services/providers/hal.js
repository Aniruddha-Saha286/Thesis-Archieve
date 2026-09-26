const { createNormalizedRecord } = require('../scholarlyRecord');

async function searchHal({ query = '', page = 1, limit = 20, offset: explicitOffset = null, filters = {}, sort = 'relevance' }) {
  try {
    const offset = typeof explicitOffset === 'number' ? explicitOffset : (page - 1) * limit;
    const cleanQ = (query || 'research thesis').trim();

    const params = new URLSearchParams();
    params.append('q', cleanQ);
    params.append('wt', 'json');
    params.append('rows', String(Math.min(limit, 30)));
    params.append('start', String(offset));
    params.append('fl', 'docid,title_s,abstract_s,authFullName_s,producedDateY_i,uri_s,files_s,fileMain_s,journalTitle_s,docType_s,doiId_s,keyword_s,domain_s');

    if (filters.hasPdf) {
      params.append('fq', 'submitType_s:file');
    }

    if (filters.publicationType === 'thesis' || filters.publicationType === 'dissertation') {
      params.append('fq', 'docType_s:THESE');
    } else if (filters.publicationType === 'journal-article') {
      params.append('fq', 'docType_s:ART');
    } else if (filters.publicationType === 'conference-paper') {
      params.append('fq', 'docType_s:COMM');
    }

    const sortParam = sort === 'newest' ? '&sort=producedDateY_i%20desc' : '';
    const url = `https://api.archives-ouvertes.fr/search/?${params.toString()}${sortParam}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `HAL status: ${res.status}` };
    }

    const data = await res.json();
    const docs = data.response?.docs || [];
    const totalCount = data.response?.numFound || 0;
    const hasMore = offset + docs.length < totalCount;

    const records = docs.map((doc) => {
      const title = Array.isArray(doc.title_s) ? doc.title_s[0] : (doc.title_s || 'HAL Research Publication');
      const doi = doc.doiId_s ? doc.doiId_s.toLowerCase() : null;

      let authors = [];
      if (doc.authFullName_s) {
        const rawArr = Array.isArray(doc.authFullName_s) ? doc.authFullName_s : [doc.authFullName_s];
        authors = rawArr.map((n) => ({ name: n.trim(), affiliation: null })).filter((a) => a.name);
      }

      const directPdfUrl = (doc.files_s && doc.files_s.length > 0) ? doc.files_s[0] : (doc.fileMain_s || null);
      if (filters.hasPdf && !directPdfUrl) return null;

      const pubYear = doc.producedDateY_i || null;
      if (filters.yearMin && pubYear && pubYear < parseInt(filters.yearMin)) return null;
      if (filters.yearMax && pubYear && pubYear > parseInt(filters.yearMax)) return null;

      const isThesis = doc.docType_s === 'THESE';
      let pubType = 'journal-article';
      if (isThesis) pubType = 'thesis';
      else if (doc.docType_s === 'COMM') pubType = 'conference-paper';
      else if (doc.docType_s === 'PREPRINT' || doc.docType_s === 'POSTPRINT') pubType = 'preprint';
      else if (doc.docType_s === 'OUV' || doc.docType_s === 'COUV') pubType = 'book';

      const fullTextLocations = [];
      if (directPdfUrl) {
        fullTextLocations.push({
          type: 'pdf',
          url: directPdfUrl,
          source: 'HAL Open Science Archive',
          isDirectPdf: true,
        });
      }
      if (doc.uri_s) {
        fullTextLocations.push({
          type: 'landing',
          url: doc.uri_s,
          source: 'HAL Document Page',
          isDirectPdf: false,
        });
      }

      const rawCategory = (Array.isArray(doc.keyword_s) ? doc.keyword_s.join(' ') : (doc.keyword_s || '')) ||
        (Array.isArray(doc.domain_s) ? doc.domain_s.join(' ') : (doc.domain_s || null));

      return createNormalizedRecord({
        id: `hal_${doc.docid}`,
        doi: doi,
        title: title,
        authors: authors,
        abstract: Array.isArray(doc.abstract_s) ? doc.abstract_s[0] : doc.abstract_s,
        category: rawCategory,
        publicationType: pubType,
        isPeerReviewed: isThesis || pubType === 'journal-article',
        publishedYear: pubYear,
        venue: doc.journalTitle_s || (isThesis ? 'European Doctoral Dissertations' : 'HAL Open Science'),
        publisher: 'HAL Open Science Archive / CNRS',
        isOpenAccess: Boolean(directPdfUrl),
        pdfUrl: directPdfUrl,
        isDirectPdf: Boolean(directPdfUrl),
        fullTextUrl: doc.uri_s || null,
        fullTextLocations: fullTextLocations,
        source: 'HAL Open Science',
        catalogId: `HAL:${doc.docid}`,
      });
    }).filter(Boolean);

    return {
      records,
      rawCount: docs.length,
      totalCount,
      hasMore,
      nextOffset: offset + docs.length,
      nextPage: hasMore ? page + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('HAL adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchHal };
