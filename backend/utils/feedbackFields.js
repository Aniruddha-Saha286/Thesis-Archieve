
const FEEDBACK_CATEGORIES = ['bug', 'idea', 'complaint', 'question', 'other'];

const FEEDBACK_STATUSES = ['new', 'in_progress', 'answered', 'closed'];

const FEEDBACK_OPEN_STATUSES = ['new', 'in_progress'];

const FEEDBACK_CATEGORY_LABELS = {
  bug: 'Something is not working',
  idea: 'Idea or suggestion',
  complaint: 'Complaint',
  question: 'Question',
  other: 'Other',
};

const FEEDBACK_STATUS_LABELS = {
  new: 'New',
  in_progress: 'In progress',
  answered: 'Answered',
  closed: 'Closed',
};

const CATEGORY_ALIASES = {
  bugs: 'bug',
  problem: 'bug',
  issue: 'bug',
  error: 'bug',
  ideas: 'idea',
  suggestion: 'idea',
  feature: 'idea',
  complaints: 'complaint',
  questions: 'question',
  help: 'question',
};

const FEEDBACK_MESSAGE_MIN = 5;
const FEEDBACK_MESSAGE_MAX = 2000;
const FEEDBACK_REPLY_MAX = 2000;
const FEEDBACK_PAGE_CONTEXT_MAX = 120;
const FEEDBACK_PREVIEW_LENGTH = 160;
const FEEDBACK_LIST_DEFAULT_LIMIT = 20;
const FEEDBACK_LIST_MAX_LIMIT = 50;

const RAW_TEXT_HARD_LIMIT = 20000;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

function normalizeFeedbackCategory(value) {
  if (typeof value !== 'string') return 'other';
  const raw = value.trim().toLowerCase();
  if (!raw) return 'other';
  if (FEEDBACK_CATEGORIES.includes(raw)) return raw;
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, raw)) return CATEGORY_ALIASES[raw];
  return 'other';
}

function isValidFeedbackStatus(value) {
  return typeof value === 'string' && FEEDBACK_STATUSES.includes(value);
}

function tidyMultilineText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanText(value, { min, max, emptyError, shortError, longError }) {
  if (typeof value !== 'string') {
    return { ok: false, value: '', error: emptyError };
  }
  if (value.length > RAW_TEXT_HARD_LIMIT) {
    return { ok: false, value: '', error: longError };
  }
  const cleaned = tidyMultilineText(value);
  if (!cleaned) {
    return { ok: false, value: '', error: emptyError };
  }
  if (cleaned.length < min) {
    return { ok: false, value: cleaned, error: shortError };
  }
  if (cleaned.length > max) {
    return { ok: false, value: cleaned, error: longError };
  }
  return { ok: true, value: cleaned, error: null };
}

function cleanFeedbackMessage(value) {
  return cleanText(value, {
    min: FEEDBACK_MESSAGE_MIN,
    max: FEEDBACK_MESSAGE_MAX,
    emptyError: 'Please write your message.',
    shortError: `Please write a little more (at least ${FEEDBACK_MESSAGE_MIN} characters).`,
    longError: `Your message is too long. Please keep it under ${FEEDBACK_MESSAGE_MAX} characters.`,
  });
}

function cleanFeedbackReply(value) {
  return cleanText(value, {
    min: 1,
    max: FEEDBACK_REPLY_MAX,
    emptyError: 'Please write a reply.',
    shortError: 'Please write a reply.',
    longError: `The reply is too long. Please keep it under ${FEEDBACK_REPLY_MAX} characters.`,
  });
}

function cleanPageContext(value) {
  if (typeof value !== 'string') return '';
  return value
    .slice(0, FEEDBACK_PAGE_CONTEXT_MAX * 4)
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FEEDBACK_PAGE_CONTEXT_MAX)
    .trim();
}

function feedbackPreview(text, maxLength = FEEDBACK_PREVIEW_LENGTH) {
  const oneLine = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLength) return oneLine;
  let cut = oneLine.slice(0, maxLength);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function readWholeNumber(value, fallback) {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFeedbackListQuery(query) {
  const source = query && typeof query === 'object' ? query : {};

  let statuses = null;
  if (source.status === 'open') {
    statuses = [...FEEDBACK_OPEN_STATUSES];
  } else if (isValidFeedbackStatus(source.status)) {
    statuses = [source.status];
  }

  const category =
    typeof source.category === 'string' && FEEDBACK_CATEGORIES.includes(source.category) ? source.category : null;

  const page = Math.min(Math.max(readWholeNumber(source.page, 1), 1), 100000);
  const limit = Math.min(
    Math.max(readWholeNumber(source.limit, FEEDBACK_LIST_DEFAULT_LIMIT), 1),
    FEEDBACK_LIST_MAX_LIMIT
  );

  return { statuses, category, page, limit };
}

module.exports = {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_OPEN_STATUSES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_PAGE_CONTEXT_MAX,
  FEEDBACK_PREVIEW_LENGTH,
  FEEDBACK_LIST_DEFAULT_LIMIT,
  FEEDBACK_LIST_MAX_LIMIT,
  normalizeFeedbackCategory,
  isValidFeedbackStatus,
  cleanFeedbackMessage,
  cleanFeedbackReply,
  cleanPageContext,
  feedbackPreview,
  parseFeedbackListQuery,
};
