
export const VIEWS = ['discover', 'datasets', 'topic', 'library', 'radar'];
export const SORTS = ['relevance', 'citations', 'newest'];
export const PUBLICATION_TYPES = ['all', 'thesis', 'journal-article', 'conference-paper', 'preprint', 'book'];

export const DEFAULT_URL_STATE = Object.freeze({
  view: 'discover',
  q: '',
  venue: '',
  type: 'all',
  sort: 'relevance',
  code: false, data: false, degree: "", program: "",
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

export function parseUrlState(search) {
  const params = new URLSearchParams(typeof search === 'string' ? search : '');
  const view = params.get('view');
  const type = params.get('type');
  const sort = params.get('sort');

  return {
    view: VIEWS.includes(view) ? view : DEFAULT_URL_STATE.view,
    q: cleanText(params.get('q'), 300),
    radar: {
      query: cleanText(params.get('rq'), 150),
      venue: ['cvpr','iccv','eccv','wacv','iclr','neurips','jmlr','arxiv'].includes(params.get('rv')) ? params.get('rv') : '',
      range: ['7','30','90','year'].includes(params.get('rr')) ? params.get('rr') : 'year',
      mode: params.get('rm') === 'activity' ? 'activity' : 'publication',
      provider: ['CVF','JMLR','OpenReview','DBLP','arXiv'].includes(params.get('rp')) ? params.get('rp') : '',
      year: cleanYear(params.get('ry')),
    },
    venue: ['cvpr','iccv','eccv','wacv','iclr','neurips','jmlr','arxiv'].includes(params.get('venue')) ? params.get('venue') : '',
    type: PUBLICATION_TYPES.includes(type) ? type : DEFAULT_URL_STATE.type,
    sort: SORTS.includes(sort) ? sort : DEFAULT_URL_STATE.sort,
    code: params.get('code') === '1', data: params.get('data') === '1',
    degree: ['bsc','msc','phd'].includes(params.get('degree')) ? params.get('degree') : '',
    program: ['cse','eee','business','pharmacy'].includes(params.get('program')) ? params.get('program') : '',
    pdf: params.get('pdf') === '1',
    oa: params.get('oa') === '1',
    from: cleanYear(params.get('from')),
    to: cleanYear(params.get('to')),
    paper: cleanText(params.get('paper'), 200),
    doi: cleanText(params.get('doi'), 200),
  };
}

export function buildUrl(state, pathname = '/') {
  const s = { ...DEFAULT_URL_STATE, ...(state || {}) };
  const params = new URLSearchParams();

  if (s.view && s.view !== 'discover' && VIEWS.includes(s.view)) params.set('view', s.view);
  if (s.view === 'radar' && s.radar) {
    for (const [key, value] of Object.entries({ rq: s.radar.query, rv: s.radar.venue, rr: s.radar.range, rm: s.radar.mode, rp: s.radar.provider, ry: s.radar.year })) {
      if (value) params.set(key, value);
    }
  }

  if (!s.view || s.view === 'discover') {
    if (s.q) params.set('q', s.q);
    if (s.venue) params.set('venue', s.venue);
    if (s.type && s.type !== 'all') params.set('type', s.type);
    if (s.sort && s.sort !== 'relevance') params.set('sort', s.sort);
    if (s.code) params.set('code', '1'); if (s.data) params.set('data', '1');
    if (['bsc','msc','phd'].includes(s.degree)) params.set('degree', s.degree);
    if (['cse','eee','business','pharmacy'].includes(s.program)) params.set('program', s.program);
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

export function paperParams(paper) {
  if (!paper) return { paper: '', doi: '' };
  const id = String(paper._id || paper.id || '').trim();
  return { paper: id.slice(0, 200), doi: paper.doi ? String(paper.doi).trim().slice(0, 200) : '' };
}

export function isArchiveId(id) {
  return /^[a-f0-9]{24}$/i.test(String(id || ''));
}

const SNAPSHOT_PREFIX = 'tta:paper:';

export function rememberPaper(storage, paper) {
  const { paper: id } = paperParams(paper);
  if (!storage || !id) return;
  try {
    storage.setItem(SNAPSHOT_PREFIX + id, JSON.stringify(paper));
  } catch {
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

const CONTEXT_PREFIX = 'tta:search:';

function contextKey(query) {
  return CONTEXT_PREFIX + String(query || '').trim().toLowerCase().slice(0, 300);
}

export function rememberSearchContext(storage, query, contextId) {
  if (!storage || !contextId || !String(query || '').trim()) return;
  try {
    storage.setItem(contextKey(query), String(contextId));
  } catch {
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
