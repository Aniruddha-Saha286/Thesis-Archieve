const crypto = require('crypto');

function normalizeDoi(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  cleaned = cleaned.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  cleaned = cleaned.replace(/^doi:\s*/i, '');
  cleaned = cleaned.replace(/^doi\/\s*/i, '');

  cleaned = cleaned.trim();

  cleaned = cleaned.replace(/[.,;/>)\]]+$/, '');

  if (!/^10\.\d{4,9}\/\S+$/i.test(cleaned)) {
    return null;
  }

  return cleaned.toLowerCase();
}

function compareDois(a, b) {
  const normA = normalizeDoi(a);
  const normB = normalizeDoi(b);
  if (!normA || !normB) return false;
  return normA === normB;
}

function computeCanonicalPaperId(paper = {}) {
  const canonicalDoi = normalizeDoi(paper.doi);
  if (canonicalDoi) {
    return `doi:${canonicalDoi}`;
  }

  if (paper.openAlexId) {
    const cleanId = String(paper.openAlexId).split('/').pop();
    if (cleanId) return `openalex:${cleanId}`;
  }

  if (paper.arxivId) {
    return `arxiv:${String(paper.arxivId).trim().toLowerCase()}`;
  }

  if (paper._id) {
    return `local:${String(paper._id)}`;
  }

  const fullTitle = String(paper.title || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');

  const year = paper.publishedYear || paper.year || '';
  const author = (Array.isArray(paper.authors) && paper.authors[0]?.name)
    ? paper.authors[0].name
    : (typeof paper.author === 'string' ? paper.author : '');
  const authorFirstSurname = author.trim().toLowerCase().split(/\s+/).pop() || '';

  const payload = `${fullTitle}|${year}|${authorFirstSurname}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24);
  return `title_hash:${hash}`;
}

module.exports = {
  normalizeDoi,
  compareDois,
  computeCanonicalPaperId,
};
