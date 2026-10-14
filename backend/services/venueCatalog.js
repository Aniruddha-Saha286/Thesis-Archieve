const VENUES = [
  { id: 'cvpr', label: 'CVPR', name: 'Computer Vision and Pattern Recognition', kind: 'conference' },
  { id: 'iccv', label: 'ICCV', name: 'International Conference on Computer Vision', kind: 'conference' },
  { id: 'eccv', label: 'ECCV', name: 'European Conference on Computer Vision', kind: 'conference' },
  { id: 'wacv', label: 'WACV', name: 'Winter Conference on Applications of Computer Vision', kind: 'conference' },
  { id: 'iclr', label: 'ICLR', name: 'International Conference on Learning Representations', kind: 'conference' },
  { id: 'neurips', label: 'NeurIPS', name: 'Advances in Neural Information Processing Systems', kind: 'conference' },
  { id: 'jmlr', label: 'JMLR', name: 'Journal of Machine Learning Research', kind: 'journal' },
  { id: 'arxiv', label: 'arXiv cs.CV', name: 'Computer vision preprints', kind: 'preprint' },
];
function identifyVenue(value) {
  const text = String(value || '').replace(/<[^>]*>/g, '').toLowerCase();
  if (/^j\.?\s*mach\.?\s*learn\.?\s*res\.?$/.test(text.trim())) return 'jmlr';
  if (/\b(workshop|workshops|findings)\b|\b(?:cvprw|iccvw|eccvw|wacvw)\b/.test(text)) return null;
  return VENUES.find(v => new RegExp('\\b' + v.id + '\\b', 'i').test(text) || text.includes(v.name.toLowerCase()) || (v.id === 'neurips' && /\bnips\b|neural information processing systems/.test(text)))?.id || null;
}
function statusLabel(record) {
  if (record.acceptanceStatus === 'accepted') return record.isPeerReviewed === true ? 'Accepted · peer reviewed' : 'Accepted · review status unknown';
  if (record.acceptanceStatus === 'published') return record.isPeerReviewed === true ? 'Published · peer reviewed' : 'Published · review status unknown';
  if (record.publicationType === 'preprint') return 'Preprint · not peer reviewed';
  if (record.isPeerReviewed === true) return 'Peer reviewed · provider metadata';
  return 'Review status unknown';
}
module.exports = { VENUES, identifyVenue, statusLabel };
