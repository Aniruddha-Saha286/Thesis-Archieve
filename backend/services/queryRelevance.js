const STOP = new Set(('a an and or not the to of in on for from by with using based use study studies research paper papers thesis dissertation dataset datasets data analysis approach approaches method methods model models framework proposed new novel system systems benchmark').split(' '));
const CONCEPTS = [
  ['machine learning', 'ml'], ['deep learning', 'dl'], ['artificial intelligence', 'ai'],
  ['natural language processing', 'nlp'], ['convolutional neural network', 'cnn'],
  ['convolutional neural networks', 'cnn'], ['recurrent neural network', 'rnn'],
  ['large language models', 'llm'], ['large language model', 'llm'],
  ['bengali', 'bangla'], ['genomics', 'genomic'],
];
function normalize(text) {
  let value = String(text || '').normalize('NFKC').toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^\p{L}\p{M}\p{N}+#]+/gu, ' ');
  for (const [phrase, alias] of [...CONCEPTS].sort((a,b) => b[0].length-a[0].length)) {
    value = (' ' + value + ' ').split(' ' + phrase + ' ').join(' ' + alias + ' ').trim();
  }
  return value;
}
function stem(word) {
  if (word === 'leaves') return 'leaf';
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0,-3)+'y';
  if (word.length > 4 && word.endsWith('s') && !/(ss|is|us|ics|ous)$/.test(word)) return word.slice(0,-1);
  return word;
}
function terms(text) {
  return [...new Set(normalize(text).split(/\s+/).filter(w => w && !STOP.has(w) && (w.length >= 2 || w === 'c')).map(stem))];
}
function metadataText(record) {
  const list = (items) => (Array.isArray(items) ? items.map(i => typeof i === 'string' ? i : i?.name || i?.label || '').join(' ') : '');
  return [record.title, record.abstract, record.description, record.authorDisplay, list(record.authors), list(record.keywords), list(record.tags), list(record.subjects), list(record.taskCategories)].filter(Boolean).join(' ');
}
function queryMatch(record, query) {
  const raw = String(query || '').trim();
  if (/^(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\//i.test(raw)) {
    const target = raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').toLowerCase();
    return { accepted: String(record.doi || '').toLowerCase() === target, score: 1, matchedTerms: [], totalTerms: 1 };
  }
  const wanted = terms(raw);
  if (!wanted.length) return { accepted: true, score: 0, matchedTerms: [], totalTerms: 0 };
  const body = new Set(terms(metadataText(record)));
  const title = new Set(terms(record.title));
  const matched = wanted.filter(w => body.has(w));
  const needed = wanted.length === 1 ? 1 : Math.max(2, Math.ceil(wanted.length / 2));
  const titleMatches = wanted.filter(w => title.has(w)).length;
  return { accepted: matched.length >= needed, score: Math.round((0.7 * titleMatches + 0.3 * matched.length) / wanted.length * 100) / 100, matchedTerms: matched, totalTerms: wanted.length };
}
module.exports = { queryMatch, terms, metadataText };
