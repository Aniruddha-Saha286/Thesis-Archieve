const REPORT_ISSUE_TYPES = ['dead-link', 'paywall', 'metadata-inaccuracy', 'retraction-unflagged', 'copyright-claim', 'other'];

const LEGACY_ALIASES = {
  broken_pdf: 'dead-link',
  broken_link: 'dead-link',
  'broken-link': 'dead-link',
  dead_link: 'dead-link',
  wrong_title: 'metadata-inaccuracy',
  wrong_metadata: 'metadata-inaccuracy',
  metadata: 'metadata-inaccuracy',
  retracted: 'retraction-unflagged',
  retraction: 'retraction-unflagged',
  copyright: 'copyright-claim',
};

const REPORT_ISSUE_LABELS = {
  'dead-link': 'Broken link or PDF',
  paywall: 'Link asks for payment',
  'metadata-inaccuracy': 'Wrong title, author or details',
  'retraction-unflagged': 'Retracted or disputed paper',
  'copyright-claim': 'Copyright concern',
  other: 'Other',
};

function normalizeReportIssueType(value) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return 'other';
  if (REPORT_ISSUE_TYPES.includes(raw)) return raw;
  if (Object.hasOwn(LEGACY_ALIASES, raw)) return LEGACY_ALIASES[raw];
  return 'other';
}

module.exports = { REPORT_ISSUE_TYPES, REPORT_ISSUE_LABELS, normalizeReportIssueType };
