const { ResearchCache } = require('./researchCache');
const { safeLink } = require('./resourceLinks');
const cache = new ResearchCache({ ttl: 60 * 60 * 1000, maxEntries: 100, maxBytes: 4 * 1024 * 1024 });
function seedIdentifier(record) {
  const candidates = [record.catalogId, record.id, record.ids?.openalex];
  const openalex = candidates.map(id => String(id || '').match(/^(?:https:\/\/openalex\.org\/|openalex_)?(W\d+)$/i)?.[1]).find(Boolean);
  if (openalex) return { provider: 'OpenAlex', id: openalex.toUpperCase() };
  const s2 = candidates.map(id => String(id || '').match(/^(?:S2:|s2_)([a-f0-9]{40})$/i)?.[1]).find(Boolean);
  if (s2) return { provider: 'Semantic Scholar', id: s2 };
  const doi = String(record.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim();
  if (/^10\.\d{4,9}\/\S{1,180}$/.test(doi)) return { provider: 'OpenAlex', id: `https://doi.org/${doi}` };
  return null;
}
async function json(url, fetcher, headers = {}) {
  const response = await fetcher(url, { headers, signal: AbortSignal.timeout(7000), redirect: 'error' });
  if (!response.ok) throw new Error(`Citation provider unavailable (${response.status})`);
  return response.json();
}
function oaRecord(p) {
  return { id: p.id, title: p.display_name || p.title, year: p.publication_year, doi: p.doi,
    authors: (p.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean).join(', '),
    url: safeLink(p.doi || p.primary_location?.landing_page_url || p.id), citationCount: p.cited_by_count || 0 };
}
function s2Record(p) { return { id: p?.paperId, title: p?.title, year: p?.year, authors: (p?.authors || []).map(a => a.name).join(', '), url: safeLink(p?.url), citationCount: p?.citationCount || 0 }; }
async function neighborhood(record, fetcher = fetch) {
  const seed = seedIdentifier(record);
  if (!seed) return { provider: '', references: [], citations: [], similar: [], unavailable: true, message: 'Citation discovery requires an indexed OpenAlex ID, Semantic Scholar ID or DOI.' };
  return cache.get(JSON.stringify(seed), async () => {
    if (seed.provider === 'Semantic Scholar') {
      const headers = process.env.SEMANTIC_SCHOLAR_API_KEY ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY } : {};
      const fields = 'title,year,authors,url,citationCount';
      const base = `https://api.semanticscholar.org/graph/v1/paper/${seed.id}`;
      const result = await Promise.allSettled([
        json(`${base}/references?limit=20&fields=${fields}`, fetcher, headers),
        json(`${base}/citations?limit=20&fields=${fields}`, fetcher, headers),
        json(`https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${seed.id}?limit=10&fields=${fields}`, fetcher, headers),
      ]);
      return { provider: seed.provider, references: result[0].value?.data?.map(x => s2Record(x.citedPaper)).filter(x => x.title) || [],
        citations: result[1].value?.data?.map(x => s2Record(x.citingPaper)).filter(x => x.title) || [],
        similar: result[2].value?.recommendedPapers?.map(s2Record).filter(x => x.title) || [], partialResults: result.some(r => r.status === 'rejected') };
    }
    const auth = process.env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENALEX_API_KEY)}` : '';
    const work = await json(`https://api.openalex.org/works/${encodeURIComponent(seed.id)}?${auth.slice(1)}`, fetcher);
    const workId = String(work.id || '').split('/').pop();
    if (!/^W\d+$/.test(workId)) throw new Error('Citation provider returned an invalid work.');
    const ids = value => (value || []).map(id => String(id).split('/').pop()).filter(id => /^W\d+$/.test(id)).slice(0, 20);
    const refs = ids(work.referenced_works), related = ids(work.related_works);
    const list = filter => json(`https://api.openalex.org/works?filter=${encodeURIComponent(filter)}&per-page=20${auth}`, fetcher);
    const result = await Promise.allSettled([refs.length ? list(`openalex:${refs.join('|')}`) : Promise.resolve({ results: [] }),
      list(`cites:${workId}`), related.length ? list(`openalex:${related.join('|')}`) : Promise.resolve({ results: [] })]);
    return { provider: seed.provider, seed: oaRecord(work), references: result[0].value?.results?.map(oaRecord) || [],
      citations: result[1].value?.results?.map(oaRecord) || [], similar: result[2].value?.results?.map(oaRecord) || [], partialResults: result.some(r => r.status === 'rejected'),
      note: 'A limited citation neighborhood, not a complete bibliography. Similarity is a recommendation, not a citation.' };
  });
}
module.exports = { seedIdentifier, neighborhood, cache };
