const crypto = require('crypto');

/**
 * Normalizes any DOI representation into canonical lowercase format:
 * - Accepts "doi:10.xxx", "https://doi.org/10.xxx", "http://dx.doi.org/10.xxx", etc.
 * - Handles case variations, extra whitespace, and harmless trailing punctuation.
 * - Returns canonical "10.xxx/yyy" or null if invalid.
 */
function normalizeDoi(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let cleaned = raw.trim();

  // Strip URI schemes and resolvers
  cleaned = cleaned.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  cleaned = cleaned.replace(/^doi:\s*/i, '');
  cleaned = cleaned.replace(/^doi\/\s*/i, '');

  // Trim whitespace again
  cleaned = cleaned.trim();

  // Strip harmless trailing punctuation (. , ; / > ) ])
  cleaned = cleaned.replace(/[.,;/>)\]]+$/, '');

  // Must start with "10." and contain at least one slash
  if (!/^10\.\d{4,9}\/\S+$/i.test(cleaned)) {
    return null;
  }

  return cleaned.toLowerCase();
}

/**
 * Exact equality comparison between two DOIs.
 * Never uses partial substring matching.
 */
function compareDois(a, b) {
  const normA = normalizeDoi(a);
  const normB = normalizeDoi(b);
  if (!normA || !normB) return false;
  return normA === normB;
}

/**
 * Derives a stable, collision-resistant canonical identity for a paper.
 * Prefers: canonical DOI, stable provider ID, or a SHA-256 hash of the FULL
 * normalized title + publication year + first author surname.
 * Never truncates title to 50 characters.
 */
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

  // Fallback: SHA-256 hash of complete normalized title + year + author
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
