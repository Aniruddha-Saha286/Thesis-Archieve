// Keeps the address bar in step with what is on screen, so that Back, refresh and
// copy-the-link all work.
//
//   /?view=library                      which page is open (discover is the default and is left out)
//   /?q=bangla+sentiment&type=thesis    the search and its main filters
//   /?paper=<id>                        the paper whose details are open
//
// Only query parameters on "/" are used, so no server or hosting rewrite rule is needed.
// Pure functions: nothing here touches the browser, which keeps them easy to test.

export const VIEWS = ['discover', 'datasets', 'topic', 'library'];
export const SORTS = ['relevance', 'citations', 'newest'];
export const PUBLICATION_TYPES = ['all', 'thesis', 'journal-article', 'conference-paper', 'preprint', 'book'];

export const DEFAULT_URL_STATE = Object.freeze({
  view: 'discover',
  q: '',
  type: 'all',
  sort: 'relevance',
  pdf: false,
  oa: false,
  from: '',
  to: '',
  paper: '',
  doi: '',
});

function cleanYear(value) {
  const text = String(value || '').trim();
  return /^(1[5-9]|20)\d{2}$/.test(text) ? text : '';
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// "?view=library&q=..." -> state. Anything unknown or malformed falls back to the default.
export function parseUrlState(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const view = params.get('view');
  const type = params.get('type');
  const sort = params.get('sort');

  return {
    view: VIEWS.includes(view) ? view : DEFAULT_URL_STATE.view,
    q: cleanText(params.get('q'), 300),
    type: PUBLICATION_TYPES.includes(type) ? type : DEFAULT_URL_STATE.type,
    sort: SORTS.includes(sort) ? sort : DEFAULT_URL_STATE.sort,
    pdf: params.get('pdf') === '1',
    oa: params.get('oa') === '1',
    from: cleanYear(params.get('from')),
    to: cleanYear(params.get('to')),
    paper: cleanText(params.get('paper'), 200),
    doi: cleanText(params.get('doi'), 200),
  };
}

// state -> "/?..." with defaults left out, so the plain home page stays "/".
// Search filters are written only for the Discover page, where they apply.
export function buildUrl(state, pathname = '/') {
  const s = { ...DEFAULT_URL_STATE, ...(state || {}) };
  const params = new URLSearchParams();

  if (s.view && s.view !== 'discover' && VIEWS.includes(s.view)) params.set('view', s.view);

  if (!s.view || s.view === 'discover') {
    if (s.q) params.set('q', s.q);
    if (s.type && s.type !== 'all') params.set('type', s.type);
    if (s.sort && s.sort !== 'relevance') params.set('sort', s.sort);
    if (s.pdf) params.set('pdf', '1');
    if (s.oa) params.set('oa', '1');
    if (s.from) params.set('from', s.from);
    if (s.to) params.set('to', s.to);
  }

  if (s.paper) {
    params.set('paper', s.paper);
    if (s.doi) params.set('doi', s.doi);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

// The part of the address that says which paper is open
export function paperParams(paper) {
  if (!paper) return { paper: '', doi: '' };
  const id = String(paper._id || paper.id || '').trim();
  return { paper: id.slice(0, 200), doi: paper.doi ? String(paper.doi).trim().slice(0, 200) : '' };
}

// A record deposited in this archive has a 24-character database id; outside records do not.
export function isArchiveId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

// Outside papers exist only in the search results that were on screen, so a small copy is
// kept for this browser tab. It lets refresh, Back and Forward reopen the same paper.
const SNAPSHOT_PREFIX = 'tta:paper:';

export function rememberPaper(storage, paper) {
  const { paper: id } = paperParams(paper);
  if (!storage || !id) return;
  try {
    storage.setItem(SNAPSHOT_PREFIX + id, JSON.stringify(paper));
  } catch {
    // Storage full or blocked: the link still works for archive papers and papers with a DOI
  }
}

export function recallPaper(storage, id) {
  if (!storage || !id) return null;
  try {
    const raw = storage.getItem(SNAPSHOT_PREFIX + id);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && parsed.title ? parsed : null;
  } catch {
    return null;
  }
}

// A search is counted against the daily limit once. The server knows it by a "context id".
// Keeping that id for this browser tab means a refresh, Back or Forward shows the same search
// again without counting it a second time.
const CONTEXT_PREFIX = 'tta:search:';

function contextKey(query) {
  return CONTEXT_PREFIX + String(query || '').trim().toLowerCase().slice(0, 300);
}

export function rememberSearchContext(storage, query, contextId) {
  if (!storage || !contextId || !String(query || '').trim()) return;
  try {
    storage.setItem(contextKey(query), String(contextId));
  } catch {
    // Storage full or blocked: the search still works, a refresh is then counted again
  }
}

export function recallSearchContext(storage, query) {
  if (!storage || !String(query || '').trim()) return null;
  try {
    const value = storage.getItem(contextKey(query));
    return value && value.length <= 200 ? value : null;
  } catch {
    return null;
  }
}
