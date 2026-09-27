const { XMLParser } = require('fast-xml-parser');
const { createNormalizedRecord } = require('../scholarlyRecord');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

async function searchArxiv({ query = '', page = 1, limit = 20, offset: explicitOffset = null, filters = {}, sort = 'relevance' }) {
  try {
    if (process.env.OFFLINE_MODE === 'true') {
      return { records: [], totalCount: 0, rawCount: 0, hasMore: false, error: null };
    }

    // If user specifically requests only theses, arXiv is a preprint archive and has no doctoral theses
    if (filters.publicationType && filters.publicationType === 'thesis') {
      return { records: [], totalCount: 0, rawCount: 0, hasMore: false, error: null };
    }

    const offset = typeof explicitOffset === 'number' ? explicitOffset : (page - 1) * limit;
    const cleanQ = (query || 'research').trim();

    // Construct search query
    const words = cleanQ.split(/\s+/).filter(Boolean);
    const searchQuery = words.length > 1
      ? words.map((w) => `all:${encodeURIComponent(w)}`).join('+AND+')
      : `all:${encodeURIComponent(cleanQ)}`;

    const sortParam = sort === 'newest'
      ? 'sortBy=submittedDate&sortOrder=descending'
      : 'sortBy=relevance&sortOrder=descending';

    const url = `https://export.arxiv.org/api/query?search_query=${searchQuery}&start=${offset}&max_results=${limit}&${sortParam}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (academic open research)',
      },
    });

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `arXiv API status: ${res.status}` };
    }

    const xml = await res.text();
    const data = xmlParser.parse(xml);
    const entries = data.feed?.entry
      ? (Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry])
      : [];

    const totalResultsStr = data.feed?.['opensearch:totalResults'];
    const totalCount = totalResultsStr ? parseInt(totalResultsStr) : entries.length;
    const hasMore = offset + entries.length < totalCount;

    const records = entries.map((entry) => {
      const rawId = (entry.id || '').split('/abs/').pop() || '';
      const cleanArxivId = rawId.replace(/v\d+$/, '').trim();

      // Authors
      let authors = [];
      if (entry.author) {
        const authArray = Array.isArray(entry.author) ? entry.author : [entry.author];
        authors = authArray.map((a) => ({
          name: a.name || 'arXiv Researcher',
          affiliation: a['arxiv:affiliation'] || null,
        }));
      }

      // Check for direct PDF link in Atom feed
      let pdfUrl = `https://arxiv.org/pdf/${cleanArxivId}.pdf`;
      if (entry.link) {
        const links = Array.isArray(entry.link) ? entry.link : [entry.link];
        const pdfLinkObj = links.find((l) => l['@_type'] === 'application/pdf' || l['@_title'] === 'pdf');
        if (pdfLinkObj && pdfLinkObj['@_href']) {
          pdfUrl = pdfLinkObj['@_href'].replace(/^http:/, 'https:');
          if (!pdfUrl.endsWith('.pdf')) pdfUrl += '.pdf';
        }
      }

      const journalRef = entry['arxiv:journal_ref'] || entry['journal_ref'] || null;
      const doi = entry['arxiv:doi'] || null;
      const pubDate = entry.published ? new Date(entry.published).toISOString().split('T')[0] : null;
      const pubYear = entry.published ? new Date(entry.published).getFullYear() : null;

      // Filter by year if requested
      if (filters.yearMin && pubYear && pubYear < parseInt(filters.yearMin)) return null;
      if (filters.yearMax && pubYear && pubYear > parseInt(filters.yearMax)) return null;

      // Extract arXiv primary category code (e.g. cs.CR, cs.AI, stat.ML)
      const rawCatTerm = entry['arxiv:primary_category']?.['@_term'] ||
        (Array.isArray(entry.category) ? entry.category[0]?.['@_term'] : entry.category?.['@_term']) || null;

      return createNormalizedRecord({
        id: `arxiv_${rawId.replace(/[^a-zA-Z0-9]/g, '_')}`,
        doi: doi,
        title: entry.title,
        authors: authors,
        abstract: entry.summary,
        category: rawCatTerm,
        publicationType: journalRef ? 'journal-article' : 'preprint',
        isPeerReviewed: Boolean(journalRef), // arXiv preprints are not peer reviewed unless published in journal
        publicationDate: pubDate,
        publishedYear: pubYear,
        venue: journalRef ? String(journalRef) : 'arXiv Preprints',
        publisher: 'Cornell University / arXiv Open Access',
        isOpenAccess: true,
        license: 'arXiv Perpetual Non-Exclusive License',
        pdfUrl: pdfUrl,
        isDirectPdf: true,
        fullTextUrl: `https://arxiv.org/abs/${rawId}`,
        fullTextLocations: [
          { type: 'pdf', url: pdfUrl, source: 'arXiv Direct PDF', isDirectPdf: true },
          { type: 'landing', url: `https://arxiv.org/abs/${rawId}`, source: 'arXiv Abstract Page', isDirectPdf: false },
        ],
        source: 'arXiv',
        catalogId: `arXiv:${rawId}`,
      });
    }).filter(Boolean);

    return {
      records,
      rawCount: entries.length,
      totalCount,
      hasMore,
      nextOffset: offset + entries.length,
      nextPage: hasMore ? page + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('arXiv adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchArxiv };
