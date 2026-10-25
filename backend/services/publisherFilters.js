const PUBLISHER_ALIASES = [
  ['ieee', 'institute of electrical and electronics engineers'], ['acm', 'association for computing machinery'],
  ['iet', 'institution of engineering and technology'], ['aaai', 'association for the advancement of artificial intelligence'],
  ['acl', 'association for computational linguistics'], ['mdpi', 'multidisciplinary digital institute'],
  ['iop', 'institute of physics'], ['oup', 'oxford university'], ['cup', 'cambridge university'],
];
function publisherPatterns(value) {
  const text = String(value || '').trim().toLowerCase(), variants = new Set([text]);
  for (const [short, long] of PUBLISHER_ALIASES) {
    if (new RegExp(`\\b${short}\\b`).test(text) || text.includes(long)) { variants.add(short); variants.add(long); }
  }
  return [...variants].filter(Boolean).map(variant => new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
module.exports = { PUBLISHER_ALIASES, publisherPatterns };
