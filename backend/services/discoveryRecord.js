const crypto = require('crypto');
const { createNormalizedRecord } = require('./scholarlyRecord');
const { cleanTitleForMatching, getFirstAuthorSurname, mergeTwoRecords } = require('./deduplicator');
const { identifyVenue } = require('./venueCatalog');
const { safeLink } = require('./resourceLinks');
function arxivId(value) {
  return String(value || '').match(/(?:arxiv[:.]|arxiv\.org\/(?:abs|pdf)\/)((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]+)?\/\d{7}))(?:v\d+)?/i)?.[1]?.toLowerCase() || null;
}
function normalizeDiscovery(data) {
  const record = createNormalizedRecord(data);
  record.title = record.title.slice(0, 1000);
  record.abstract = record.abstract?.slice(0, 20000) || null;
  record.authors = record.authors.slice(0, 100);
  record.source = data.source || data.sources?.[0]?.provider || 'Unknown';
  record.isExternal = true;
  record.venueId = identifyVenue(data.venue);
  record.arxivId = [data.arxivId ? 'arxiv:' + data.arxivId : '', data.catalogId, data.fullTextUrl, data.doi].map(arxivId).find(Boolean) || null;
  record.acceptanceStatus = ['accepted', 'published', 'preprint'].includes(data.acceptanceStatus) ? data.acceptanceStatus : 'unknown';
  record.isPeerReviewed = data.isPeerReviewed === true;
  record.datePrecision = data.datePrecision || (data.publicationDate && /^\d{4}-\d{2}-\d{2}$/.test(data.publicationDate) ? 'day' : 'year');
  if (record.datePrecision !== 'day') record.publicationDate = null;
  if (record.publicationDate && (!Number.isFinite(Date.parse(record.publicationDate)) || new Date(record.publicationDate).toISOString().slice(0, 10) !== record.publicationDate)) record.publicationDate = null;
  for (const field of ['pdfUrl', 'fullTextUrl', 'codeUrl', 'datasetUrl']) record[field] = safeLink(record[field]) || null;
  record.fullTextLocations = record.fullTextLocations.filter(l => safeLink(l.url)).slice(0, 20);
  record.sources = record.sources.map(s => ({ ...s, url: safeLink(s.url) || '' })).slice(0, 20);
  record.alternateVersions = (data.alternateVersions || []).filter(v => safeLink(v.url)).slice(0, 20);
  record.codeEvidence = record.codeUrl ? data.codeEvidence || null : null;
  record.datasetEvidence = record.datasetUrl ? data.datasetEvidence || null : null;
  record.publicationEvidence = data.publicationEvidence || null;
  record.license = data.license || null;
  return record;
}
function identityKeys(r) {
  const keys = [];
  if (r.doi) keys.push('doi:' + r.doi);
  if (r.arxivId) keys.push('arxiv:' + r.arxivId);
  const title = cleanTitleForMatching(r.title), author = String(r.authors?.[0]?.name || '').toLowerCase().trim() || getFirstAuthorSurname(r.authors);
  if (title.length >= 15 && author) keys.push('title:' + crypto.createHash('sha256').update(title + '|' + author).digest('hex'));
  for (const s of r.sources || []) if (s.id || s.url) keys.push('source:' + s.provider + ':' + (s.id || s.url));
  return [...new Set(keys)];
}
function mergeDiscovery(a, b) {
  const strong = r => ['accepted', 'published'].includes(r.acceptanceStatus) && r.publicationEvidence;
  const preferred = strong(b) && !strong(a) ? b : a;
  const other = preferred === a ? b : a;
  const merged = mergeTwoRecords({ ...preferred, sources: [...preferred.sources], fullTextLocations: [...preferred.fullTextLocations] }, other);
  merged.alternateVersions = [...new Map([...(a.alternateVersions || []), ...(b.alternateVersions || []), ...a.sources, ...b.sources].filter(s => s.url).map(s => [s.url, { ...s }])).values()].slice(0, 20);
  merged.arxivId = a.arxivId || b.arxivId;
  if (!merged.codeEvidence) merged.codeEvidence = other.codeEvidence;
  if (!merged.datasetEvidence) merged.datasetEvidence = other.datasetEvidence;
  return merged;
}
module.exports = { arxivId, normalizeDiscovery, identityKeys, mergeDiscovery };
