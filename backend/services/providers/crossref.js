const { createNormalizedRecord } = require('../scholarlyRecord');

async function searchCrossref({ query = '', page = 1, limit = 20, offset: explicitOffset = null, filters = {}, sort = 'relevance' }) {
  try {
    if (process.env.OFFLINE_MODE === 'true') {
      return { records: [], totalCount: 0, rawCount: 0, hasMore: false, error: null };
    }

    const offset = typeof explicitOffset === 'number' ? explicitOffset : (page - 1) * limit;
    const params = new URLSearchParams();

    if (query && query.trim()) {
      params.append('query', query.trim());
    } else {
      params.append('query', 'thesis research');
    }

    params.append('rows', String(Math.min(limit, 40)));
    params.append('offset', String(offset));

    const filterList = [];
    if (filters.publicationType) {
      if (filters.publicationType === 'thesis' || filters.publicationType === 'dissertation') {
        filterList.push('type:dissertation');
      } else if (filters.publicationType === 'journal-article') {
        filterList.push('type:journal-article');
      } else if (filters.publicationType === 'conference-paper') {
        filterList.push('type:proceedings-article');
      }
    }

    if (filters.yearMin) {
      filterList.push(`from-pub-date:${filters.yearMin}-01-01`);
    }
    if (filters.yearMax) {
      filterList.push(`until-pub-date:${filters.yearMax}-12-31`);
    }

    if (filterList.length > 0) {
      params.append('filter', filterList.join(','));
    }

    if (sort === 'newest') {
      params.append('sort', 'created');
      params.append('order', 'desc');
    }

    const url = `https://api.crossref.org/works?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (https://projectpanther.org; mailto:panther.thesis.vault@gmail.com)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `Crossref status: ${res.status}` };
    }

    const data = await res.json();
    const items = data.message?.items || [];
    const totalCount = data.message?.['total-results'] || 0;
    const hasMore = offset + items.length < totalCount;

    const records = items.map((it) => {
      const title = it.title?.[0] || 'Crossref Scholarly Work';
      const doi = it.DOI ? it.DOI.toLowerCase() : null;

      const authors = (it.author || []).map((a) => ({
        name: `${a.given || ''} ${a.family || ''}`.trim() || 'Academic Researcher',
        affiliation: a.affiliation?.[0]?.name || null,
      })).filter((a) => a.name);

      const dateParts = it.published?.['date-parts']?.[0] || it.created?.['date-parts']?.[0];
      const publishedYear = dateParts ? dateParts[0] : null;

      let directPdfUrl = null;
      if (it.link && Array.isArray(it.link)) {
        const pdfEntry = it.link.find((l) => l['content-type'] === 'application/pdf');
        if (pdfEntry && pdfEntry.URL) {
          directPdfUrl = pdfEntry.URL;
        }
      }
      if (!directPdfUrl && it.resource?.primary?.URL) {
        if (/\.pdf(\?|$|#)/i.test(it.resource.primary.URL) || it.resource.primary.URL.includes('/pdf/')) {
          directPdfUrl = it.resource.primary.URL;
        }
      }

      if (filters.hasPdf && !directPdfUrl) return null;

      const fullTextLocations = [];
      if (directPdfUrl) {
        fullTextLocations.push({
          type: 'pdf',
          url: directPdfUrl,
          source: 'Crossref Direct Link',
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

      const isRetracted = Boolean(
        it['update-to'] && Array.isArray(it['update-to']) &&
        it['update-to'].some((u) => u.type === 'retraction' || u.label?.toLowerCase().includes('retract'))
      );

      const citationCount = typeof it['is-referenced-by-count'] === 'number' ? it['is-referenced-by-count'] : null;

      const venue = it['container-title']?.[0] || null;
      const publisher = it.publisher || null;

      let pubType = 'journal-article';
      if (it.type === 'dissertation') pubType = 'thesis';
      else if (it.type === 'proceedings-article') pubType = 'conference-paper';
      else if (it.type === 'posted-content') pubType = 'preprint';
      else if (it.type === 'book' || it.type === 'monograph' || it.type === 'edited-book') pubType = 'book';

      const rawCategory = Array.isArray(it.subject) ? it.subject.join(' ') : (it.subject || null);

      return createNormalizedRecord({
        id: `crossref_${doi ? doi.replace(/[^a-zA-Z0-9]/g, '_') : Math.random().toString(36).substring(7)}`,
        doi: doi,
        title: title,
        authors: authors,
        abstract: it.abstract ? it.abstract.replace(/<[^>]*>/g, '').trim() : null,
        category: rawCategory,
        publicationType: pubType,
        isPeerReviewed: pubType === 'journal-article' || pubType === 'conference-paper',
        publishedYear: publishedYear,
        venue: venue,
        publisher: publisher,
        isOpenAccess: Boolean(directPdfUrl),
        pdfUrl: directPdfUrl,
        isDirectPdf: Boolean(directPdfUrl),
        fullTextUrl: doi ? `https://doi.org/${doi}` : null,
        fullTextLocations: fullTextLocations,
        isRetracted: isRetracted,
        citationCount: citationCount,
        citationSource: 'Crossref',
        source: 'Crossref',
        catalogId: doi ? `DOI:${doi}` : null,
      });
    }).filter(Boolean);

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
    console.error('Crossref adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchCrossref };
