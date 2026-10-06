// Pure helpers for the "send feedback to the team" feature.
// Nothing in this file touches the database, the network or the request object, so the same
// rules can be used by the routes, by the Feedback model and by the tests.

// What a message can be about. The form shows these in this order.
const FEEDBACK_CATEGORIES = ['bug', 'idea', 'complaint', 'question', 'other'];

// Where a message is in the team's queue.
const FEEDBACK_STATUSES = ['new', 'in_progress', 'answered', 'closed'];

// "Open" is the staff's to-do list: nobody has answered or closed these yet.
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

// Other words a screen might send for the same thing. Mapping them keeps the right category
// instead of quietly filing everything under "other".
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

// Text far longer than this is rejected before any cleaning, so a huge paste costs nothing.
const RAW_TEXT_HARD_LIMIT = 20000;

// Invisible characters that have no place in a message: old terminal control codes, and the
// "reverse the reading direction" marks that can make text display differently from what was typed.
// Line breaks and tabs are handled separately. The joiner marks Bangla and other scripts need
// (U+200C, U+200D) are deliberately left alone.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

// Returns a category the model accepts. Unknown or missing values become "other" so a
// message is never lost because of an unexpected category name.
function normalizeFeedbackCategory(value) {
  if (typeof value !== 'string') return 'other';
  const raw = value.trim().toLowerCase();
  if (!raw) return 'other';
  if (FEEDBACK_CATEGORIES.includes(raw)) return raw;
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, raw)) return CATEGORY_ALIASES[raw];
  return 'other';
}

// Strict on purpose: staff screens send the exact stored value, so anything else is a mistake
// that should be reported back instead of guessed at.
function isValidFeedbackStatus(value) {
  return typeof value === 'string' && FEEDBACK_STATUSES.includes(value);
}

// Shared cleaning for anything a person typed into a multi-line box.
// Keeps the words and the paragraphs, removes what could break a screen or an email.
function tidyMultilineText(text) {
  return text
    .replace(/\r\n?/g, '\n') // Windows and old Mac line endings
    .replace(/[\u2028\u2029]/g, '\n') // Unicode line and paragraph separators
    .replace(/\t/g, ' ')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/[^\S\n]+$/gm, '') // spaces left at the end of a line
    .replace(/\n{3,}/g, '\n\n') // at most one empty line between paragraphs
    .trim();
}

// Cleans a typed text and checks its length.
// Always returns { ok, value, error } and never throws, whatever it is given.
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

// The message a user sends to the team.
function cleanFeedbackMessage(value) {
  return cleanText(value, {
    min: FEEDBACK_MESSAGE_MIN,
    max: FEEDBACK_MESSAGE_MAX,
    emptyError: 'Please write your message.',
    shortError: `Please write a little more (at least ${FEEDBACK_MESSAGE_MIN} characters).`,
    longError: `Your message is too long. Please keep it under ${FEEDBACK_MESSAGE_MAX} characters.`,
  });
}

// The reply a staff member writes back. A short reply such as "Fixed" is fine.
function cleanFeedbackReply(value) {
  return cleanText(value, {
    min: 1,
    max: FEEDBACK_REPLY_MAX,
    emptyError: 'Please write a reply.',
    shortError: 'Please write a reply.',
    longError: `The reply is too long. Please keep it under ${FEEDBACK_REPLY_MAX} characters.`,
  });
}

// Which screen the user was on ("discover", "library", "paper:<id>"...). It only helps staff
// understand the message, so a strange value is cleaned or dropped and never causes an error.
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

// One-line summary of a longer text, for notifications and email subjects.
function feedbackPreview(text, maxLength = FEEDBACK_PREVIEW_LENGTH) {
  const oneLine = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLength) return oneLine;
  let cut = oneLine.slice(0, maxLength);
  // Do not leave half of an emoji (or other two-part character) at the cut.
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

// Reads a whole number from a query string value, falling back when it is missing or nonsense.
function readWholeNumber(value, fallback) {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Turns the staff list's query string (?status=&category=&page=&limit=) into safe values.
// - statuses: null means "any status"; otherwise the list of statuses to show.
// - category: null means "any category".
// Unknown filter values are ignored (treated as "all") so a stale link still shows the list.
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
