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
  const degreeMatch = !filters.degree || ({ bsc: /b\.?\s?sc|bachelor|undergraduate|final year/, msc: /m\.?\s?sc|master/, phd: /ph\.?\s?d|doctor/ }[filters.degree]?.test(degree) === true);
  const department = String(record.department || '').toLowerCase();
  const programMatch = !filters.program || ({ cse: /computer|\bcse\b/, eee: /electrical|electronic|\beee\b/, business: /business|economics|\bbba\b/, pharmacy: /pharma/ }[filters.program]?.test(department) === true);
  const openDataset = Boolean(links.dataset && record.isOpenDataset === true);
  return (!filters.hasCode || Boolean(links.code)) && (!filters.hasDataset || Boolean(links.dataset)) && (!filters.hasOpenDataset || openDataset) && degreeMatch && programMatch;
}
module.exports = { safeLink, resources, matchesResources };
