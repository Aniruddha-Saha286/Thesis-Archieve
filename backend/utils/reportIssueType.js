// Canonical issue types stored on a Report, plus the names older screens used to send.
// The report form once sent "broken_pdf", "paywall", "wrong_title" and "retracted", which the
// Report model rejected, so those reports failed with a server error.
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

// Returns a canonical type. Unknown or missing values become "other" so a report is never lost.
function normalizeReportIssueType(value) {
  const raw = String(value == null ? '' : value).trim().toLowerCase();
  if (!raw) return 'other';
  if (REPORT_ISSUE_TYPES.includes(raw)) return raw;
  // hasOwn: a value such as "constructor" must not pick up something built into every object
  if (Object.hasOwn(LEGACY_ALIASES, raw)) return LEGACY_ALIASES[raw];
  return 'other';
}

module.exports = { REPORT_ISSUE_TYPES, REPORT_ISSUE_LABELS, normalizeReportIssueType };
