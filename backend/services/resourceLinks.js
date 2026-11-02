const DEGREE_PATTERNS = { bsc: /\bb\.?\s*sc\b|\bbachelor(?:'?s)?\b|\bundergraduate\b|\bfinal[- ]year\b/i, msc: /\bm\.?\s*sc\b|\bmaster(?:'?s)?\b/i, phd: /\bph\.?\s*d\b|\bdoctor(?:al|ate)?\b/i };
const PROGRAM_PATTERNS = { cse: /computer|\bcse\b/i, eee: /electrical|electronic|\beee\b/i, business: /business|economics|\bbba\b/i, pharmacy: /pharma/i };
function safeLink(value, hosts) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (hosts && !hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return '';
    return url.href;
  } catch { return ''; }
}
function resources(record) {
  return {
    code: safeLink(record.codeUrl, ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']),
    dataset: safeLink(record.datasetUrl),
  };
}
function matchesResources(record, filters) {
  const links = resources(record);
  const degree = String(record.degreeType || '').toLowerCase();
  const degreeMatch = !filters.degree || DEGREE_PATTERNS[filters.degree]?.test(degree) === true;
  const department = String(record.department || '').toLowerCase();
  const programMatch = !filters.program || PROGRAM_PATTERNS[filters.program]?.test(department) === true;
  const openDataset = Boolean(links.dataset && record.isOpenDataset === true);
  return (!filters.hasCode || Boolean(links.code)) && (!filters.hasDataset || Boolean(links.dataset)) && (!filters.hasOpenDataset || openDataset) && degreeMatch && programMatch;
}
function hasDirectPdf(record) {
  const isPdf = (value, declared) => {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
      return declared === true || /\.pdf$/i.test(url.pathname) || /\/pdf(?:\/|$)/i.test(url.pathname) || /\/servlets\/purl(?:\/|$)/i.test(url.pathname);
    } catch { return false; }
  };
  return isPdf(record.pdfUrl, record.isDirectPdf) || (record.fullTextLocations || []).some(location => location.type === 'pdf' && isPdf(location.url, location.isDirectPdf));
}
module.exports = { safeLink, resources, matchesResources, hasDirectPdf, DEGREE_PATTERNS, PROGRAM_PATTERNS };
