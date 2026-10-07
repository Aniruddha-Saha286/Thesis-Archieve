const assert = require('assert');
const { EventEmitter } = require('events');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_OPEN_STATUSES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_PAGE_CONTEXT_MAX,
  normalizeFeedbackCategory,
  isValidFeedbackStatus,
  cleanFeedbackMessage,
  cleanFeedbackReply,
  cleanPageContext,
  feedbackPreview,
  parseFeedbackListQuery,
} = require('../utils/feedbackFields');
const Feedback = require('../models/Feedback');
const Notification = require('../models/Notification');
const User = require('../models/User');
const emailService = require('../services/emailService');
const realtime = require('../socket');
const { PERMISSIONS } = require('../constants/permissions');
const feedbackRouter = require('../routes/feedback');

const CH = {
  nul: String.fromCharCode(0x00),
  bell: String.fromCharCode(0x07),
  escape: String.fromCharCode(0x1b),
  del: String.fromCharCode(0x7f),
  rightToLeftOverride: String.fromCharCode(0x202e),
  isolate: String.fromCharCode(0x2066),
  byteOrderMark: String.fromCharCode(0xfeff),
  lineSeparator: String.fromCharCode(0x2028),
  paragraphSeparator: String.fromCharCode(0x2029),
  zeroWidthJoiner: String.fromCharCode(0x200d),
  zeroWidthNonJoiner: String.fromCharCode(0x200c),
};

async function runFeedbackTests() {
  console.log('\n===============================================================');
  console.log('  TEST SUITE: USER FEEDBACK TO THE TEAM                        ');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(description, fn) {
    total += 1;
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ [PASS] ${description}`);
    } catch (err) {
      console.error(`  ✗ [FAIL] ${description}`);
      console.error(`    ${err.message}`);
      throw err;
    }
  }


  const undo = [];
  function replace(target, key, value) {
    const had = Object.prototype.hasOwnProperty.call(target, key);
    const original = target[key];
    target[key] = value;
    undo.push(() => {
      if (had) target[key] = original;
      else delete target[key];
    });
  }
  function setEnv(key, value) {
    const had = Object.prototype.hasOwnProperty.call(process.env, key);
    const original = process.env[key];
    process.env[key] = value;
    undo.push(() => {
      if (had) process.env[key] = original;
      else delete process.env[key];
    });
  }

  setEnv('NODE_ENV', 'test');
  setEnv('OFFLINE_MODE', 'true');
  setEnv('JWT_SECRET', 'feedback-test-only-secret');

  const newId = () => new mongoose.Types.ObjectId();
  const person = (fields) => ({ _id: newId(), permissions: [], status: 'approved', role: 'student', ...fields });

  const people = {
    admin: person({ name: 'Head Admin', email: 'admin@example.edu', role: 'admin' }),
    secondAdmin: person({ name: 'Second Admin', email: 'admin2@example.edu', role: 'admin' }),
    reportsEditor: person({
      name: 'Reports Editor',
      email: 'reports.editor@example.edu',
      role: 'editor',
      permissions: [PERMISSIONS.REPORTS_MODERATE],
    }),
    otherEditor: person({
      name: 'Payments Editor',
      email: 'payments.editor@example.edu',
      role: 'editor',
      permissions: [PERMISSIONS.PAYMENTS_VIEW],
    }),
    student: person({ name: 'Rafi Ahmed', email: 'rafi@example.edu' }),
    otherStudent: person({ name: 'Nadia Karim', email: 'nadia@example.edu' }),
    pendingStudent: person({ name: 'Waiting Student', email: 'waiting@example.edu', status: 'pending' }),
    rejectedStudent: person({ name: 'Turned Down', email: 'turned.down@example.edu', status: 'rejected' }),
    bannedStudent: person({ name: 'Banned Person', email: 'banned@example.edu', status: 'banned' }),
  };
  const peopleById = new Map(Object.values(people).map((p) => [String(p._id), p]));
  const tokenFor = (who) => jwt.sign({ id: String(who._id) }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const db = {
    feedback: [],
    notifications: [],
    failFeedbackWrites: null,
    failNotificationWrites: null,
    lastSeenUpdate: null,
    clock: Date.UTC(2026, 0, 1),
  };
  const nextMoment = () => {
    db.clock += 60 * 1000;
    return new Date(db.clock);
  };

  function matches(doc, filter) {
    return Object.entries(filter || {}).every(([key, wanted]) => {
      const actual = key === '_id' ? doc._id : doc[key];
      if (wanted && typeof wanted === 'object' && Array.isArray(wanted.$in)) {
        return wanted.$in.map(String).includes(String(actual));
      }
      return String(actual) === String(wanted);
    });
  }

  function fakeQuery(run) {
    const state = { sort: null, skip: 0, limit: null };
    const query = {
      sort(value) {
        state.sort = value;
        return query;
      },
      skip(value) {
        state.skip = value;
        return query;
      },
      limit(value) {
        state.limit = value;
        return query;
      },
      select() {
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve()
          .then(() => run(state))
          .then(resolve, reject);
      },
    };
    return query;
  }

  function failIfAsked() {
    if (db.failFeedbackWrites) throw db.failFeedbackWrites;
  }

  replace(Feedback.prototype, 'save', async function save() {
    failIfAsked();
    const invalid = this.validateSync();
    if (invalid) throw invalid;
    if (!this.createdAt) this.createdAt = nextMoment();
    this.updatedAt = nextMoment();
    if (!db.feedback.includes(this)) db.feedback.push(this);
    return this;
  });
  replace(Feedback, 'find', (filter) =>
    fakeQuery((state) => {
      failIfAsked();
      let rows = db.feedback.filter((doc) => matches(doc, filter));
      if (state.sort && state.sort.createdAt === -1) {
        rows = rows.slice().sort((a, b) => b.createdAt - a.createdAt);
      }
      rows = rows.slice(state.skip || 0);
      if (state.limit != null) rows = rows.slice(0, state.limit);
      return rows;
    })
  );
  replace(Feedback, 'countDocuments', async (filter) => {
    failIfAsked();
    return db.feedback.filter((doc) => matches(doc, filter)).length;
  });
  replace(Feedback, 'findById', async (id) => {
    failIfAsked();
    return db.feedback.find((doc) => String(doc._id) === String(id)) || null;
  });
  replace(Feedback, 'findOneAndUpdate', async (filter, update, options) => {
    failIfAsked();
    db.lastSeenUpdate = { filter, update, options };
    const doc = db.feedback.find((item) => matches(item, filter));
    if (!doc) return null;
    Object.assign(doc, update);
    return doc;
  });
  replace(Notification.prototype, 'save', async function save() {
    if (db.failNotificationWrites) throw db.failNotificationWrites;
    const invalid = this.validateSync();
    if (invalid) throw invalid;
    db.notifications.push(this);
    return this;
  });
  replace(User, 'findById', (id) => fakeQuery(() => peopleById.get(String(id)) || null));
  replace(User, 'find', (filter) =>
    fakeQuery((state) => {
      const rows = Object.values(people).filter((p) => matches(p, filter));
      return state.limit != null ? rows.slice(0, state.limit) : rows;
    })
  );

  const pushes = { toUser: [], toAdmins: [], rooms: [] };
  const fakeIo = {
    to(room) {
      const target = { room, except: null };
      const chain = {
        except(excluded) {
          target.except = excluded;
          return chain;
        },
        emit(event, payload) {
          pushes.rooms.push({ ...target, event, payload });
        },
      };
      return chain;
    },
  };
  replace(realtime, 'emitToUser', (userId, event, payload) => pushes.toUser.push({ userId, event, payload }));
  replace(realtime, 'emitToAdmins', (event, payload) => pushes.toAdmins.push({ event, payload }));
  replace(realtime, 'getIO', () => fakeIo);

  const realNotifyAdminNewFeedback = emailService.notifyAdminNewFeedback;
  const realNotifyUserFeedbackReply = emailService.notifyUserFeedbackReply;
  const emails = { toAdmin: [], toUser: [] };
  replace(emailService, 'notifyAdminNewFeedback', async (args) => {
    emails.toAdmin.push(args);
    return { success: true, mocked: true };
  });
  replace(emailService, 'notifyUserFeedbackReply', async (args) => {
    emails.toUser.push(args);
    return { success: true, mocked: true };
  });

  function resetRecorders() {
    db.notifications.length = 0;
    db.failFeedbackWrites = null;
    db.failNotificationWrites = null;
    db.lastSeenUpdate = null;
    pushes.toUser.length = 0;
    pushes.toAdmins.length = 0;
    pushes.rooms.length = 0;
    emails.toAdmin.length = 0;
    emails.toUser.length = 0;
  }

  async function collectingErrors(fn) {
    const original = console.error;
    const logged = [];
    console.error = (...parts) => logged.push(parts.map((part) => (part && part.message) || String(part)).join(' '));
    try {
      await fn(logged);
    } finally {
      console.error = original;
    }
    return logged;
  }

  class FakeResponse extends EventEmitter {
    constructor() {
      super();
      this.statusCode = 200;
      this.headers = {};
      this.headersSent = false;
      this.writableEnded = false;
      this.body = undefined;
    }
    status(code) {
      this.statusCode = code;
      return this;
    }
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
      return this;
    }
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    }
    json(payload) {
      this.body = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload));
      this.finish();
      return this;
    }
    send(payload) {
      if (payload && typeof payload === 'object') return this.json(payload);
      this.body = payload;
      this.finish();
      return this;
    }
    end() {
      this.finish();
      return this;
    }
    finish() {
      if (this.writableEnded) return;
      this.headersSent = true;
      this.writableEnded = true;
      this.emit('finish');
    }
  }

  function call(method, url, { as = null, token, body, ip = '10.20.30.40' } = {}) {
    return new Promise((resolve, reject) => {
      const queryText = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      const headers = {};
      const bearer = token !== undefined ? token : as ? tokenFor(as) : null;
      if (bearer) headers.authorization = `Bearer ${bearer}`;

      const req = {
        method,
        url,
        originalUrl: `/api/feedback${url}`,
        baseUrl: '',
        headers,
        body,
        query: querystring.parse(queryText),
        ip,
        app: { get: () => false },
        socket: {},
      };
      const res = new FakeResponse();
      res.once('finish', () => setImmediate(() => setImmediate(() => resolve(res))));

      feedbackRouter.handle(req, res, (err) => {
        if (err) return reject(err);
        res.statusCode = 404;
        res.body = { unmatched: true };
        return resolve(res);
      });
    });
  }

  function seed(owner, fields = {}) {
    const doc = new Feedback({
      user: owner._id,
      userEmail: owner.email,
      userName: owner.name,
      message: 'A seeded message for the tests.',
      ...fields,
    });
    doc.createdAt = fields.createdAt || nextMoment();
    doc.updatedAt = doc.createdAt;
    db.feedback.push(doc);
    return doc;
  }

  const plain = (message) => typeof message === 'string' && message.length > 0 && message.length < 200;

  try {
    console.log('--- 1. Helper rules (utils/feedbackFields.js) ---');

    await test('Categories and statuses are exactly the agreed lists, each with a readable label', () => {
      assert.deepStrictEqual(FEEDBACK_CATEGORIES, ['bug', 'idea', 'complaint', 'question', 'other']);
      assert.deepStrictEqual(FEEDBACK_STATUSES, ['new', 'in_progress', 'answered', 'closed']);
      assert.deepStrictEqual(FEEDBACK_OPEN_STATUSES, ['new', 'in_progress']);
      for (const category of FEEDBACK_CATEGORIES) {
        assert.ok(plain(FEEDBACK_CATEGORY_LABELS[category]), `missing label for ${category}`);
      }
      for (const status of FEEDBACK_STATUSES) {
        assert.ok(plain(FEEDBACK_STATUS_LABELS[status]), `missing label for ${status}`);
      }
      assert.strictEqual(Object.keys(FEEDBACK_CATEGORY_LABELS).length, FEEDBACK_CATEGORIES.length);
      assert.strictEqual(Object.keys(FEEDBACK_STATUS_LABELS).length, FEEDBACK_STATUSES.length);
      assert.strictEqual(FEEDBACK_MESSAGE_MIN, 5);
      assert.strictEqual(FEEDBACK_MESSAGE_MAX, 2000);
      assert.strictEqual(FEEDBACK_REPLY_MAX, 2000);
      assert.strictEqual(FEEDBACK_PAGE_CONTEXT_MAX, 120);
    });

    await test('Category: known names pass through, also with capitals or spaces around them', () => {
      for (const category of FEEDBACK_CATEGORIES) {
        assert.strictEqual(normalizeFeedbackCategory(category), category);
        assert.strictEqual(normalizeFeedbackCategory(`  ${category.toUpperCase()} `), category);
      }
      assert.strictEqual(normalizeFeedbackCategory('suggestion'), 'idea');
      assert.strictEqual(normalizeFeedbackCategory('Feature'), 'idea');
      assert.strictEqual(normalizeFeedbackCategory('problem'), 'bug');
      assert.strictEqual(normalizeFeedbackCategory('help'), 'question');
    });

    await test('Category: unknown, empty or odd values become "other" and never throw', () => {
      const odd = ['praise', '', '   ', null, undefined, 42, true, {}, [], ['bug'], { $ne: 'bug' }, 'constructor', '__proto__', 'toString'];
      for (const value of odd) {
        assert.strictEqual(normalizeFeedbackCategory(value), 'other');
      }
    });

    await test('Status check is strict: only the four stored values are accepted', () => {
      for (const status of FEEDBACK_STATUSES) assert.strictEqual(isValidFeedbackStatus(status), true);
      for (const value of ['open', 'New', ' new', 'done', '', null, undefined, 1, {}, ['new'], { $ne: 'new' }]) {
        assert.strictEqual(isValidFeedbackStatus(value), false, `accepted ${JSON.stringify(value)}`);
      }
    });

    await test('Message: trims, keeps paragraphs, and tidies line endings, tabs and extra blank lines', () => {
      const result = cleanFeedbackMessage('  \r\n Search is slow.   \r\n\r\n\r\n\r\n\tPlease look at it. \r Thanks \n\n ');
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.error, null);
      assert.strictEqual(result.value, 'Search is slow.\n\n Please look at it.\n Thanks');
      assert.strictEqual(cleanFeedbackMessage('one\n \n \n \ntwo').value, 'one\n\ntwo');
      assert.strictEqual(
        cleanFeedbackMessage(`first${CH.lineSeparator}second${CH.paragraphSeparator}third`).value,
        'first\nsecond\nthird'
      );
    });

    await test('Message: invisible control and text-direction characters are removed', () => {
      const dirty = `He${CH.nul}llo${CH.bell} the${CH.escape}re${CH.del}${CH.rightToLeftOverride}${CH.isolate}${CH.byteOrderMark}!`;
      const result = cleanFeedbackMessage(dirty);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, 'Hello there!');
      assert.strictEqual(cleanFeedbackMessage(`${CH.nul}${CH.rightToLeftOverride}${CH.byteOrderMark}  `).ok, false);
    });

    await test('Message: Bangla text, its joiner marks, emoji and symbols are kept untouched', () => {
      const bangla = `আমার লাইব্রেরি খুলছে না ${CH.zeroWidthJoiner}${CH.zeroWidthNonJoiner} 😀 <b>&</b> "quoted" 50% $5`;
      const result = cleanFeedbackMessage(bangla);
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.value, bangla);
    });

    await test('Message: too short is refused with a plain sentence; 5 characters is enough', () => {
      for (const value of ['', '    ', '\n\n\t ', 'hey', 'abcd', '  ab  cd'.slice(0, 6).trim().slice(0, 4)]) {
        const result = cleanFeedbackMessage(value);
        assert.strictEqual(result.ok, false, `accepted ${JSON.stringify(value)}`);
        assert.ok(plain(result.error));
      }
      assert.match(cleanFeedbackMessage('').error, /write your message/i);
      assert.match(cleanFeedbackMessage('abcd').error, /at least 5 characters/);
      assert.strictEqual(cleanFeedbackMessage('   abcd      ').ok, false);
      assert.strictEqual(cleanFeedbackMessage('abcde').ok, true);
      assert.strictEqual(cleanFeedbackMessage('  abcde  ').value, 'abcde');
    });

    await test('Message: too long is refused (not silently cut); exactly 2000 characters is allowed', () => {
      const atLimit = cleanFeedbackMessage('a'.repeat(2000));
      assert.strictEqual(atLimit.ok, true);
      assert.strictEqual(atLimit.value.length, 2000);

      const over = cleanFeedbackMessage('a'.repeat(2001));
      assert.strictEqual(over.ok, false);
      assert.match(over.error, /too long/i);
      assert.match(over.error, /2000/);

      assert.strictEqual(cleanFeedbackMessage(`   ${'a'.repeat(2000)}   `).ok, true);

      const started = Date.now();
      const huge = cleanFeedbackMessage('x'.repeat(3 * 1024 * 1024));
      assert.strictEqual(huge.ok, false);
      assert.strictEqual(huge.value, '');
      assert.match(huge.error, /too long/i);
      assert.ok(Date.now() - started < 1000, 'huge input took too long to refuse');
    });

    await test('Message: values that are not text are refused without throwing', () => {
      for (const value of [null, undefined, 42, 0, true, false, {}, [], ['a long enough message'], { message: 'hello there' }, () => 'x']) {
        const result = cleanFeedbackMessage(value);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.value, '');
        assert.ok(plain(result.error));
      }
    });

    await test('Reply: a short reply is fine, an empty or over-long one is refused', () => {
      assert.deepStrictEqual(cleanFeedbackReply('  OK  '), { ok: true, value: 'OK', error: null });
      assert.strictEqual(cleanFeedbackReply('Thanks.\r\n\r\n\r\n\r\nFixed today.').value, 'Thanks.\n\nFixed today.');
      for (const value of ['', '   ', '\n', null, undefined, 7, {}, []]) {
        const result = cleanFeedbackReply(value);
        assert.strictEqual(result.ok, false);
        assert.match(result.error, /write a reply/i);
      }
      assert.strictEqual(cleanFeedbackReply('r'.repeat(2000)).ok, true);
      const over = cleanFeedbackReply('r'.repeat(2001));
      assert.strictEqual(over.ok, false);
      assert.match(over.error, /too long/i);
    });

    await test('Page context: normal values pass, odd ones are cleaned, cut to 120 or dropped', () => {
      for (const value of ['discover', 'library', 'topic-check', 'paper:64f0c2a1b2c3d4e5f6a7b8c9', 'paper:https://openalex.org/W123']) {
        assert.strictEqual(cleanPageContext(value), value);
      }
      assert.strictEqual(cleanPageContext('  topic \n check\t '), 'topic check');
      assert.strictEqual(cleanPageContext(`lib${CH.nul}rary${CH.rightToLeftOverride}`), 'library');
      assert.strictEqual(cleanPageContext('p'.repeat(500)).length, 120);
      assert.ok(cleanPageContext(`${'p'.repeat(119)} tail`).length <= 120);
      assert.strictEqual(cleanPageContext(`${'p'.repeat(119)} tail`), 'p'.repeat(119));
      for (const value of [null, undefined, 5, {}, [], ['discover'], true, '', '   ']) {
        assert.strictEqual(cleanPageContext(value), '');
      }
    });

    await test('Preview: one line, at most 160 characters plus "…", and never half an emoji', () => {
      assert.strictEqual(feedbackPreview('Short reply.'), 'Short reply.');
      assert.strictEqual(feedbackPreview('line one\n\nline   two'), 'line one line two');
      assert.strictEqual(feedbackPreview(null), '');
      assert.strictEqual(feedbackPreview(undefined), '');

      const exact = 'e'.repeat(160);
      assert.strictEqual(feedbackPreview(exact), exact);

      const long = feedbackPreview('w'.repeat(500));
      assert.strictEqual(long, `${'w'.repeat(160)}…`);

      const emojiAtCut = feedbackPreview(`${'a'.repeat(159)}😀 and more text after it`);
      assert.strictEqual(emojiAtCut, `${'a'.repeat(159)}…`);

      assert.strictEqual(feedbackPreview('abcdefghij', 4), 'abcd…');
    });

    await test('Queue filters: defaults, "open", paging limits, and unknown or hostile values ignored', () => {
      assert.deepStrictEqual(parseFeedbackListQuery({}), { statuses: null, category: null, page: 1, limit: 20 });
      assert.deepStrictEqual(parseFeedbackListQuery(undefined), { statuses: null, category: null, page: 1, limit: 20 });
      assert.deepStrictEqual(parseFeedbackListQuery(null), { statuses: null, category: null, page: 1, limit: 20 });

      assert.deepStrictEqual(parseFeedbackListQuery({ status: 'open' }).statuses, ['new', 'in_progress']);
      for (const status of FEEDBACK_STATUSES) {
        assert.deepStrictEqual(parseFeedbackListQuery({ status }).statuses, [status]);
      }
      for (const status of ['', 'all', 'everything', ['new', 'closed'], { $ne: 'closed' }]) {
        assert.strictEqual(parseFeedbackListQuery({ status }).statuses, null);
      }

      assert.strictEqual(parseFeedbackListQuery({ category: 'bug' }).category, 'bug');
      for (const category of ['', 'all', 'praise', ['bug'], { $gt: '' }]) {
        assert.strictEqual(parseFeedbackListQuery({ category }).category, null);
      }

      assert.deepStrictEqual(parseFeedbackListQuery({ page: '3', limit: '10' }), { statuses: null, category: null, page: 3, limit: 10 });
      assert.strictEqual(parseFeedbackListQuery({ limit: '500' }).limit, 50);
      assert.strictEqual(parseFeedbackListQuery({ limit: '50' }).limit, 50);
      assert.strictEqual(parseFeedbackListQuery({ limit: '0' }).limit, 1);
      assert.strictEqual(parseFeedbackListQuery({ limit: '-9' }).limit, 1);
      assert.strictEqual(parseFeedbackListQuery({ limit: 'many' }).limit, 20);
      assert.strictEqual(parseFeedbackListQuery({ page: '0' }).page, 1);
      assert.strictEqual(parseFeedbackListQuery({ page: '-4' }).page, 1);
      assert.strictEqual(parseFeedbackListQuery({ page: 'abc' }).page, 1);
      assert.strictEqual(parseFeedbackListQuery({ page: ['2', '3'] }).page, 1);
      assert.strictEqual(parseFeedbackListQuery({ page: '2.9' }).page, 2);
      assert.ok(parseFeedbackListQuery({ page: '99999999999999999999' }).page <= 100000);
    });

    console.log('--- 2. Feedback model and notification types ---');

    await test('Model: a minimal message is valid and gets the agreed defaults', () => {
      const doc = new Feedback({ user: newId(), message: 'The library page will not open.' });
      assert.strictEqual(doc.validateSync(), undefined);
      assert.strictEqual(doc.category, 'other');
      assert.strictEqual(doc.status, 'new');
      assert.strictEqual(doc.userSeenReply, false);
      assert.strictEqual(doc.adminReply, '');
      assert.strictEqual(doc.pageContext, '');
      assert.strictEqual(doc.userEmail, '');
      assert.strictEqual(doc.userName, '');
      assert.strictEqual(doc.repliedBy, null);
      assert.strictEqual(doc.repliedByName, '');
      assert.strictEqual(doc.repliedAt, null);
    });

    await test('Model: the user and the message are required; the message is trimmed and 5 to 2000 long', () => {
      const empty = new Feedback({});
      const errors = empty.validateSync()?.errors || {};
      assert.ok(errors.user, 'user should be required');
      assert.ok(errors.message, 'message should be required');

      const trimmed = new Feedback({ user: newId(), message: '   needs trimming   ' });
      assert.strictEqual(trimmed.message, 'needs trimming');

      assert.ok(new Feedback({ user: newId(), message: 'abcd' }).validateSync()?.errors?.message);
      assert.ok(new Feedback({ user: newId(), message: '      ab      ' }).validateSync()?.errors?.message);
      assert.strictEqual(new Feedback({ user: newId(), message: 'abcde' }).validateSync(), undefined);
      assert.strictEqual(new Feedback({ user: newId(), message: 'm'.repeat(2000) }).validateSync(), undefined);
      assert.ok(new Feedback({ user: newId(), message: 'm'.repeat(2001) }).validateSync()?.errors?.message);
      assert.ok(new Feedback({ user: 'not-an-id', message: 'A valid message.' }).validateSync()?.errors?.user);
    });

    await test('Model: every listed category and status is accepted and invented ones are refused', () => {
      for (const category of FEEDBACK_CATEGORIES) {
        assert.strictEqual(new Feedback({ user: newId(), message: 'A valid message.', category }).validateSync(), undefined);
      }
      for (const status of FEEDBACK_STATUSES) {
        assert.strictEqual(new Feedback({ user: newId(), message: 'A valid message.', status }).validateSync(), undefined);
      }
      assert.ok(new Feedback({ user: newId(), message: 'A valid message.', category: 'praise' }).validateSync()?.errors?.category);
      assert.ok(new Feedback({ user: newId(), message: 'A valid message.', status: 'open' }).validateSync()?.errors?.status);
    });

    await test('Model: page context over 120 and reply over 2000 characters are refused', () => {
      const base = { user: newId(), message: 'A valid message.' };
      assert.strictEqual(new Feedback({ ...base, pageContext: 'c'.repeat(120) }).validateSync(), undefined);
      assert.ok(new Feedback({ ...base, pageContext: 'c'.repeat(121) }).validateSync()?.errors?.pageContext);
      assert.strictEqual(new Feedback({ ...base, adminReply: 'r'.repeat(2000) }).validateSync(), undefined);
      assert.ok(new Feedback({ ...base, adminReply: 'r'.repeat(2001) }).validateSync()?.errors?.adminReply);
    });

    await test('Model: keeps created/updated times, links to User, and indexes user and status', () => {
      const { schema } = Feedback;
      assert.strictEqual(schema.options.timestamps, true);
      assert.ok(schema.path('createdAt'));
      assert.ok(schema.path('updatedAt'));
      assert.strictEqual(schema.path('user').options.ref, 'User');
      assert.strictEqual(schema.path('repliedBy').options.ref, 'User');
      assert.strictEqual(schema.path('user').options.index, true);
      assert.strictEqual(schema.path('status').options.index, true);
      assert.strictEqual(Feedback.modelName, 'Feedback');
    });

    await test('Notification model accepts the two feedback types and still refuses invented ones', () => {
      for (const type of ['feedback_new', 'feedback_reply']) {
        const notif = new Notification({ user: newId(), type, title: 'T', message: 'M', data: { feedbackId: 'x' } });
        assert.strictEqual(notif.validateSync(), undefined, `Notification refused ${type}`);
      }
      for (const type of ['report_created', 'payment_claim', 'topic_alert', 'general']) {
        assert.strictEqual(new Notification({ user: newId(), type, title: 'T', message: 'M' }).validateSync(), undefined);
      }
      assert.ok(new Notification({ user: newId(), type: 'feedback_whatever', title: 'T', message: 'M' }).validateSync()?.errors?.type);
    });

    console.log('--- 3. Emails ---');

    await test('Email to admin: right recipient and subject, user text escaped, paragraphs kept', async () => {
      assert.strictEqual(emailService.isMockMode(), true, 'email must be in offline mode during tests');
      emailService.clearSentEmails();
      const result = await realNotifyAdminNewFeedback({
        feedbackId: 'fb123',
        category: 'bug',
        categoryLabel: FEEDBACK_CATEGORY_LABELS.bug,
        message: 'Search broke <script>alert("x")</script>\nSecond line & more',
        pageContext: 'discover',
        userName: 'Rafi <b>Ahmed</b>',
        userEmail: 'rafi@example.edu',
      });
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mocked, true);

      const sent = emailService.getSentEmails();
      assert.strictEqual(sent.length, 1);
      assert.strictEqual(sent[0].to, emailService.getAdminNotificationEmail());
      assert.ok(sent[0].subject.startsWith('[Feedback] '));
      assert.ok(sent[0].subject.includes(FEEDBACK_CATEGORY_LABELS.bug));
      assert.ok(sent[0].subject.includes('Rafi'));
      assert.ok(sent[0].html.includes('The Thesis Archive'));
      assert.ok(!sent[0].html.includes('<script>'), 'script tag must be escaped');
      assert.ok(sent[0].html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Second line &amp; more'));
      assert.ok(!sent[0].html.includes('<b>Ahmed</b>'));
      assert.ok(sent[0].html.includes('rafi@example.edu'));
      assert.ok(sent[0].html.includes('discover'));
      assert.ok(sent[0].html.includes('fb123'));
      assert.ok(sent[0].text.includes('Second line & more'));
    });

    await test('Email to user: goes to the user with the reply and their own message, safely escaped', async () => {
      emailService.clearSentEmails();
      const result = await realNotifyUserFeedbackReply({
        userEmail: 'Rafi@Example.edu',
        userName: 'Rafi',
        categoryLabel: FEEDBACK_CATEGORY_LABELS.question,
        originalMessage: 'How do I <export> my list?',
        reply: 'Open Library.\nChoose "Export" <now>.',
      });
      assert.strictEqual(result.success, true);

      const sent = emailService.getSentEmails();
      assert.strictEqual(sent.length, 1);
      assert.strictEqual(sent[0].to, 'rafi@example.edu');
      assert.ok(sent[0].subject.includes('Reply to Your Feedback'));
      assert.ok(sent[0].subject.includes('The Thesis Archive'));
      assert.ok(sent[0].html.includes('Hello <strong>Rafi</strong>'));
      assert.ok(sent[0].html.includes('How do I &lt;export&gt; my list?'));
      assert.ok(sent[0].html.includes('Open Library.<br>Choose &quot;Export&quot; &lt;now&gt;.'));
      assert.ok(!sent[0].html.includes('<now>'));
      assert.ok(sent[0].text.includes('Open Library.\nChoose "Export" <now>.'));
    });

    await test('Emails never throw: missing input, no address, bad address, odd values', async () => {
      emailService.clearSentEmails();
      assert.strictEqual((await realNotifyAdminNewFeedback()).success, true);
      assert.strictEqual((await realNotifyAdminNewFeedback({ message: null, userName: 12345, category: {} })).success, true);

      await realNotifyAdminNewFeedback({ userName: 'Eve\r\nBcc: someone@else.com', message: 'Hello there' });
      const last = emailService.getSentEmails().pop();
      assert.ok(!/[\r\n]/.test(last.subject));

      emailService.clearSentEmails();
      for (const args of [undefined, {}, { userEmail: '' }, { userEmail: 'not-an-email' }, { userEmail: null, reply: 'x' }, { userEmail: 42 }]) {
        const result = await realNotifyUserFeedbackReply(args);
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.reason, 'NO_RECIPIENT');
      }
      assert.strictEqual(emailService.getSentEmails().length, 0, 'no email may be queued without a valid address');
      assert.strictEqual((await realNotifyUserFeedbackReply({ userEmail: 'a@b.co' })).success, true);
      emailService.clearSentEmails();
    });

    console.log('--- 4. Who may use the endpoints ---');

    await test('The router loads as an Express router and declares exactly the five endpoints', () => {
      assert.strictEqual(typeof feedbackRouter, 'function');
      assert.strictEqual(typeof feedbackRouter.handle, 'function');
      const declared = feedbackRouter.stack
        .filter((layer) => layer.route)
        .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
      assert.deepStrictEqual(declared, ['POST /', 'GET /mine', 'GET /admin', 'PUT /admin/:id', 'PUT /:id/seen']);
      assert.strictEqual(feedbackRouter.stack[0].route, undefined);
      assert.strictEqual(feedbackRouter.stack[0].name, 'authenticateToken');
    });

    await test('Without a valid sign-in every endpoint answers 401 and nothing is stored', async () => {
      resetRecorders();
      const id = String(newId());
      const requests = [
        ['POST', '/', { message: 'A perfectly fine message.' }],
        ['GET', '/mine'],
        ['PUT', `/${id}/seen`],
        ['GET', '/admin'],
        ['PUT', `/admin/${id}`, { status: 'closed' }],
      ];
      const before = db.feedback.length;
      for (const [method, url, body] of requests) {
        const anonymous = await call(method, url, { body });
        assert.strictEqual(anonymous.statusCode, 401, `${method} ${url} without token`);
        assert.ok(plain(anonymous.body.message));

        const forged = await call(method, url, { body, token: 'not.a.real.token' });
        assert.strictEqual(forged.statusCode, 401, `${method} ${url} with a forged token`);

        const wrongSecret = jwt.sign({ id: String(people.admin._id) }, 'some-other-secret');
        const impostor = await call(method, url, { body, token: wrongSecret });
        assert.strictEqual(impostor.statusCode, 401, `${method} ${url} with a token signed by someone else`);

        const deletedAccount = jwt.sign({ id: String(newId()) }, process.env.JWT_SECRET);
        const ghost = await call(method, url, { body, token: deletedAccount });
        assert.strictEqual(ghost.statusCode, 401, `${method} ${url} for an account that no longer exists`);
      }
      assert.strictEqual(db.feedback.length, before);
      assert.strictEqual(db.notifications.length, 0);
    });

    await test('A banned account is refused with 403 on every endpoint', async () => {
      resetRecorders();
      const id = String(newId());
      const before = db.feedback.length;
      for (const [method, url, body] of [
        ['POST', '/', { message: 'Please unban me right now.' }],
        ['GET', '/mine'],
        ['PUT', `/${id}/seen`],
        ['GET', '/admin'],
        ['PUT', `/admin/${id}`, { status: 'closed' }],
      ]) {
        const res = await call(method, url, { as: people.bannedStudent, body });
        assert.strictEqual(res.statusCode, 403, `${method} ${url}`);
        assert.strictEqual(res.body.status, 'banned');
      }
      assert.strictEqual(db.feedback.length, before);
    });

    console.log('--- 5. POST / (send a message) ---');

    await test('A student still waiting for approval can send a message (201, agreed response shape)', async () => {
      resetRecorders();
      const res = await call('POST', '/', {
        as: people.pendingStudent,
        body: { category: 'question', message: '  When will my account be approved?  \r\n\r\n\r\n\r\nThank you. ', pageContext: 'library' },
      });
      assert.strictEqual(res.statusCode, 201);
      assert.deepStrictEqual(Object.keys(res.body).sort(), ['feedback', 'message']);
      assert.ok(plain(res.body.message));

      const { feedback } = res.body;
      assert.match(feedback._id, /^[a-f0-9]{24}$/);
      assert.strictEqual(feedback.user, String(people.pendingStudent._id));
      assert.strictEqual(feedback.userEmail, 'waiting@example.edu');
      assert.strictEqual(feedback.userName, 'Waiting Student');
      assert.strictEqual(feedback.category, 'question');
      assert.strictEqual(feedback.message, 'When will my account be approved?\n\nThank you.');
      assert.strictEqual(feedback.pageContext, 'library');
      assert.strictEqual(feedback.status, 'new');
      assert.strictEqual(feedback.adminReply, '');
      assert.strictEqual(feedback.repliedBy, null);
      assert.strictEqual(feedback.repliedByName, '');
      assert.strictEqual(feedback.repliedAt, null);
      assert.strictEqual(feedback.userSeenReply, false);
      assert.ok(feedback.createdAt && feedback.updatedAt);

      const stored = db.feedback.find((doc) => String(doc._id) === feedback._id);
      assert.ok(stored, 'the message must be saved');
      assert.strictEqual(String(stored.user), String(people.pendingStudent._id));

      for (const who of [people.rejectedStudent, people.student, people.otherEditor, people.admin]) {
        const other = await call('POST', '/', { as: who, body: { message: 'I also have something to say.' } });
        assert.strictEqual(other.statusCode, 201, `${who.name} should be able to send feedback`);
        assert.strictEqual(other.body.feedback.user, String(who._id));
      }
    });

    await test('Unknown category becomes "other"; the sender cannot set status, reply or owner themselves', async () => {
      resetRecorders();
      const res = await call('POST', '/', {
        as: people.student,
        body: {
          category: 'praise',
          message: 'Trying to slip extra fields in.',
          pageContext: `  paper:abc123 \n ${'z'.repeat(300)}`,
          status: 'closed',
          adminReply: 'Self-written reply',
          repliedByName: 'Fake Admin',
          userSeenReply: true,
          user: String(people.otherStudent._id),
          userEmail: 'someone.else@example.edu',
          userName: 'Someone Else',
          _id: String(newId()),
        },
      });
      assert.strictEqual(res.statusCode, 201);
      const { feedback } = res.body;
      assert.strictEqual(feedback.category, 'other');
      assert.strictEqual(feedback.status, 'new');
      assert.strictEqual(feedback.adminReply, '');
      assert.strictEqual(feedback.repliedByName, '');
      assert.strictEqual(feedback.userSeenReply, false);
      assert.strictEqual(feedback.user, String(people.student._id));
      assert.strictEqual(feedback.userEmail, 'rafi@example.edu');
      assert.strictEqual(feedback.userName, 'Rafi Ahmed');
      assert.strictEqual(feedback.pageContext.length, 120);
      assert.ok(feedback.pageContext.startsWith('paper:abc123 zzz'));

      const noCategory = await call('POST', '/', { as: people.student, body: { message: 'No category given at all.' } });
      assert.strictEqual(noCategory.statusCode, 201);
      assert.strictEqual(noCategory.body.feedback.category, 'other');
      assert.strictEqual(noCategory.body.feedback.pageContext, '');
    });

    await test('A missing, too short, too long or non-text message gets 400 with a plain sentence; nothing is stored', async () => {
      resetRecorders();
      const before = db.feedback.length;
      const badBodies = [
        undefined,
        {},
        { message: '' },
        { message: '     ' },
        { message: 'hey' },
        { message: 'x'.repeat(2001) },
        { message: 12345 },
        { message: null },
        { message: ['a long enough message'] },
        { message: { $gt: '' } },
      ];
      for (const body of badBodies) {
        const res = await call('POST', '/', { as: people.otherStudent, body });
        assert.strictEqual(res.statusCode, 400, `accepted ${JSON.stringify(body)}`);
        assert.deepStrictEqual(Object.keys(res.body), ['message']);
        assert.ok(plain(res.body.message));
        assert.ok(!/valid|schema|path|cast|mongo/i.test(res.body.message), 'database wording must not reach the user');
      }
      assert.match((await call('POST', '/', { as: people.otherStudent, body: { message: 'hey' } })).body.message, /at least 5 characters/);
      assert.match((await call('POST', '/', { as: people.otherStudent, body: { message: 'x'.repeat(5000) } })).body.message, /too long/i);
      assert.strictEqual(db.feedback.length, before);
      assert.strictEqual(db.notifications.length, 0);
      assert.strictEqual(emails.toAdmin.length, 0);
      assert.strictEqual(pushes.toUser.length + pushes.toAdmins.length + pushes.rooms.length, 0);
    });

    await test('On success: stored notification for each admin, live pushes like the report route, and one admin email', async () => {
      resetRecorders();
      const res = await call('POST', '/', {
        as: people.otherStudent,
        body: { category: 'bug', message: `The export button does nothing. ${'Details. '.repeat(40)}`, pageContext: 'library' },
      });
      assert.strictEqual(res.statusCode, 201);
      const feedbackId = res.body.feedback._id;

      assert.strictEqual(db.notifications.length, 2);
      assert.deepStrictEqual(
        db.notifications.map((n) => String(n.user)).sort(),
        [String(people.admin._id), String(people.secondAdmin._id)].sort()
      );
      for (const notif of db.notifications) {
        assert.strictEqual(notif.type, 'feedback_new');
        assert.strictEqual(notif.title, 'New feedback from a user');
        assert.ok(notif.message.includes('Nadia Karim'));
        assert.ok(notif.message.includes(FEEDBACK_CATEGORY_LABELS.bug));
        assert.ok(notif.message.includes('The export button does nothing.'));
        assert.ok(notif.message.length < 260, 'notification text must stay short');
        assert.strictEqual(notif.read, false);
        assert.deepStrictEqual(notif.data, { feedbackId, category: 'bug' });
      }

      assert.strictEqual(pushes.toUser.length, 2);
      for (const push of pushes.toUser) {
        assert.strictEqual(push.event, 'notification:new');
        assert.strictEqual(typeof push.userId, 'string');
        assert.strictEqual(String(push.payload.user), push.userId);
        assert.ok(db.notifications.includes(push.payload));
      }

      assert.strictEqual(pushes.toAdmins.length, 1);
      assert.strictEqual(pushes.toAdmins[0].event, 'notification:new');
      assert.deepStrictEqual(Object.keys(pushes.toAdmins[0].payload).sort(), ['data', 'message', 'title', 'type']);
      assert.strictEqual(pushes.toAdmins[0].payload.type, 'feedback_new');
      assert.deepStrictEqual(pushes.toAdmins[0].payload.data, { feedbackId, category: 'bug' });

      assert.strictEqual(pushes.rooms.length, 1);
      assert.strictEqual(pushes.rooms[0].room, 'perm:reports.moderate');
      assert.strictEqual(pushes.rooms[0].except, 'role:admin');
      assert.strictEqual(pushes.rooms[0].event, 'notification:new');
      assert.deepStrictEqual(pushes.rooms[0].payload, pushes.toAdmins[0].payload);

      assert.strictEqual(emails.toAdmin.length, 1);
      assert.strictEqual(emails.toUser.length, 0);
      const mail = emails.toAdmin[0];
      assert.strictEqual(String(mail.feedbackId), feedbackId);
      assert.strictEqual(mail.category, 'bug');
      assert.strictEqual(mail.categoryLabel, FEEDBACK_CATEGORY_LABELS.bug);
      assert.strictEqual(mail.message, res.body.feedback.message);
      assert.strictEqual(mail.pageContext, 'library');
      assert.strictEqual(mail.userName, 'Nadia Karim');
      assert.strictEqual(mail.userEmail, 'nadia@example.edu');
    });

    await test('Email or notification trouble never fails or delays the saved message', async () => {
      const sendOk = { message: 'This message must survive side-effect trouble.' };

      resetRecorders();
      const original = emailService.notifyAdminNewFeedback;
      let logged = await collectingErrors(async () => {
        emailService.notifyAdminNewFeedback = () => {
          throw new Error('smtp exploded');
        };
        const res = await call('POST', '/', { as: people.rejectedStudent, body: sendOk });
        assert.strictEqual(res.statusCode, 201);
      });
      assert.ok(logged.some((line) => line.includes('[EmailService] Feedback notification error:') && line.includes('smtp exploded')));

      logged = await collectingErrors(async () => {
        emailService.notifyAdminNewFeedback = async () => {
          throw new Error('smtp timed out');
        };
        const res = await call('POST', '/', { as: people.rejectedStudent, body: sendOk });
        assert.strictEqual(res.statusCode, 201);
      });
      assert.ok(logged.some((line) => line.includes('smtp timed out')));

      emailService.notifyAdminNewFeedback = () => new Promise(() => {});
      const slow = await call('POST', '/', { as: people.rejectedStudent, body: sendOk });
      assert.strictEqual(slow.statusCode, 201);
      emailService.notifyAdminNewFeedback = original;

      resetRecorders();
      logged = await collectingErrors(async () => {
        db.failNotificationWrites = new Error('notification store is down');
        const res = await call('POST', '/', { as: people.pendingStudent, body: sendOk });
        assert.strictEqual(res.statusCode, 201);
        assert.ok(db.feedback.some((doc) => String(doc._id) === res.body.feedback._id));
      });
      assert.ok(logged.some((line) => line.includes('[Feedback] Staff notification error:')));
      resetRecorders();
    });

    await test('With no live server running (the normal state in tests) sending still works', async () => {
      resetRecorders();
      const stubbed = { emitToUser: realtime.emitToUser, emitToAdmins: realtime.emitToAdmins, getIO: realtime.getIO };
      const originals = undo
        .slice()
        .reverse()
        .slice(0, 0);
      assert.strictEqual(originals.length, 0);
      realtime.getIO = () => null;
      try {
        const res = await call('POST', '/', { as: people.otherEditor, body: { message: 'Works without live updates too.' } });
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(pushes.rooms.length, 0);
        assert.strictEqual(db.notifications.length, 2);
      } finally {
        Object.assign(realtime, stubbed);
      }
    });

    await test('A database failure answers 500 with a plain sentence, logs the real error, and leaks nothing', async () => {
      resetRecorders();
      const secret = 'E11000 duplicate key mongodb://internal-host:27017 secret-detail';
      const logged = await collectingErrors(async () => {
        db.failFeedbackWrites = new Error(secret);
        const res = await call('POST', '/', { as: people.admin, body: { message: 'This one will hit a broken database.' } });
        assert.strictEqual(res.statusCode, 500);
        assert.deepStrictEqual(Object.keys(res.body), ['message']);
        assert.ok(plain(res.body.message));
        assert.ok(!JSON.stringify(res.body).includes('E11000'));
        assert.ok(!JSON.stringify(res.body).includes('internal-host'));

        const mine = await call('GET', '/mine', { as: people.admin });
        assert.strictEqual(mine.statusCode, 500);
        assert.ok(!JSON.stringify(mine.body).includes('secret-detail'));

        const queue = await call('GET', '/admin', { as: people.admin });
        assert.strictEqual(queue.statusCode, 500);
        assert.ok(!JSON.stringify(queue.body).includes('secret-detail'));

        const seen = await call('PUT', `/${String(newId())}/seen`, { as: people.admin });
        assert.strictEqual(seen.statusCode, 500);
        assert.ok(!JSON.stringify(seen.body).includes('secret-detail'));

        const update = await call('PUT', `/admin/${String(newId())}`, { as: people.admin, body: { status: 'closed' }, ip: '10.1.1.1' });
        assert.strictEqual(update.statusCode, 500);
        assert.ok(!JSON.stringify(update.body).includes('secret-detail'));
      });
      for (const label of [
        '[Feedback] Submit error:',
        '[Feedback] Failed to retrieve own feedback:',
        '[Feedback] Failed to retrieve feedback queue:',
        '[Feedback] Mark seen error:',
        '[Feedback] Update error:',
      ]) {
        assert.ok(logged.some((line) => line.includes(label) && line.includes('E11000')), `missing server log "${label}"`);
      }
      assert.strictEqual(emails.toAdmin.length, 0);
      assert.strictEqual(db.notifications.length, 0);
      resetRecorders();
    });

    await test('Rate limit: 5 messages per user, the 6th gets 429 with a plain sentence, others are unaffected', async () => {
      resetRecorders();
      const chatty = person({ name: 'Chatty Student', email: 'chatty@example.edu' });
      const quiet = person({ name: 'Quiet Student', email: 'quiet@example.edu' });
      peopleById.set(String(chatty._id), chatty);
      peopleById.set(String(quiet._id), quiet);

      for (let i = 1; i <= 5; i += 1) {
        const res = await call('POST', '/', { as: chatty, body: { message: `Message number ${i} from me.` }, ip: `10.0.0.${i}` });
        assert.strictEqual(res.statusCode, 201, `message ${i} should be accepted`);
      }
      const before = db.feedback.length;
      const sixth = await call('POST', '/', { as: chatty, body: { message: 'One message too many.' }, ip: '10.0.0.99' });
      assert.strictEqual(sixth.statusCode, 429);
      assert.deepStrictEqual(Object.keys(sixth.body), ['message']);
      assert.match(sixth.body.message, /wait a few minutes/i);
      assert.strictEqual(db.feedback.length, before, 'a refused message must not be stored');

      const seventh = await call('POST', '/', { as: chatty, body: { message: 'Still too many, same account.' } });
      assert.strictEqual(seventh.statusCode, 429);

      const other = await call('POST', '/', { as: quiet, body: { message: 'My first message today.' }, ip: '10.0.0.1' });
      assert.strictEqual(other.statusCode, 201);

      assert.strictEqual((await call('GET', '/mine', { as: chatty })).statusCode, 200);

      await feedbackRouter.feedbackSubmitLimiter.resetKey(`feedback:${String(chatty._id)}`);
      const afterWait = await call('POST', '/', { as: chatty, body: { message: 'Back after waiting.' } });
      assert.strictEqual(afterWait.statusCode, 201);
    });

    await test('Rate limit: messages refused for being too short do not use up the allowance', async () => {
      resetRecorders();
      const careful = person({ name: 'Careful Student', email: 'careful@example.edu' });
      peopleById.set(String(careful._id), careful);

      for (let i = 0; i < 9; i += 1) {
        const res = await call('POST', '/', { as: careful, body: { message: 'hm' } });
        assert.strictEqual(res.statusCode, 400);
      }
      for (let i = 1; i <= 5; i += 1) {
        const res = await call('POST', '/', { as: careful, body: { message: `A proper message, number ${i}.` } });
        assert.strictEqual(res.statusCode, 201, `valid message ${i} should still be accepted`);
      }
      const sixth = await call('POST', '/', { as: careful, body: { message: 'And one more proper message.' } });
      assert.strictEqual(sixth.statusCode, 429);
    });

    console.log('--- 6. GET /mine and PUT /:id/seen ---');

    await test('GET /mine returns only the caller\'s own messages, newest first, at most 50', async () => {
      resetRecorders();
      const reader = person({ name: 'Reader', email: 'reader@example.edu' });
      const stranger = person({ name: 'Stranger', email: 'stranger@example.edu' });
      peopleById.set(String(reader._id), reader);
      peopleById.set(String(stranger._id), stranger);

      const empty = await call('GET', '/mine', { as: reader });
      assert.strictEqual(empty.statusCode, 200);
      assert.deepStrictEqual(empty.body, { feedback: [] });

      for (let i = 1; i <= 3; i += 1) seed(reader, { message: `Reader message ${i}` });
      seed(stranger, { message: 'Private message from the stranger' });
      seed(reader, { message: 'Reader message 4' });

      const res = await call('GET', '/mine', { as: reader });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(Object.keys(res.body), ['feedback']);
      assert.deepStrictEqual(
        res.body.feedback.map((item) => item.message),
        ['Reader message 4', 'Reader message 3', 'Reader message 2', 'Reader message 1']
      );
      assert.ok(res.body.feedback.every((item) => item.user === String(reader._id)));
      assert.ok(!JSON.stringify(res.body).includes('Private message from the stranger'));

      for (let i = 5; i <= 60; i += 1) seed(reader, { message: `Reader message ${i}` });
      const capped = await call('GET', '/mine', { as: reader });
      assert.strictEqual(capped.body.feedback.length, 50);
      assert.strictEqual(capped.body.feedback[0].message, 'Reader message 60');
      assert.strictEqual(capped.body.feedback[49].message, 'Reader message 11');

      const sneaky = await call('GET', `/mine?user=${String(stranger._id)}&limit=500`, { as: reader });
      assert.strictEqual(sneaky.body.feedback.length, 50);
      assert.ok(sneaky.body.feedback.every((item) => item.user === String(reader._id)));
    });

    await test('PUT /:id/seen marks the caller\'s own reply as read and returns the updated message', async () => {
      resetRecorders();
      const mine = seed(people.student, { adminReply: 'We fixed it.', status: 'answered', userSeenReply: false });
      const res = await call('PUT', `/${String(mine._id)}/seen`, { as: people.student });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(Object.keys(res.body).sort(), ['feedback', 'message']);
      assert.ok(plain(res.body.message));
      assert.strictEqual(res.body.feedback._id, String(mine._id));
      assert.strictEqual(res.body.feedback.userSeenReply, true);
      assert.strictEqual(mine.userSeenReply, true);
      assert.strictEqual(mine.status, 'answered');
      assert.strictEqual(mine.adminReply, 'We fixed it.');

      assert.strictEqual(String(db.lastSeenUpdate.filter._id), String(mine._id));
      assert.strictEqual(String(db.lastSeenUpdate.filter.user), String(people.student._id));
      assert.deepStrictEqual(db.lastSeenUpdate.update, { userSeenReply: true });
      assert.strictEqual(db.lastSeenUpdate.options.returnDocument, 'after');

      const tamper = await call('PUT', `/${String(mine._id)}/seen`, { as: people.student, body: { status: 'closed', adminReply: 'hacked', userSeenReply: false } });
      assert.strictEqual(tamper.statusCode, 200);
      assert.strictEqual(mine.status, 'answered');
      assert.strictEqual(mine.adminReply, 'We fixed it.');
      assert.strictEqual(mine.userSeenReply, true);
      assert.strictEqual(db.notifications.length, 0);
    });

    await test('PUT /:id/seen answers 404 for someone else\'s message, an unknown id and a malformed id (never 500)', async () => {
      resetRecorders();
      const theirs = seed(people.otherStudent, { adminReply: 'Private reply.', status: 'answered' });

      const notMine = await call('PUT', `/${String(theirs._id)}/seen`, { as: people.student });
      assert.strictEqual(notMine.statusCode, 404);
      assert.deepStrictEqual(notMine.body, { message: 'Feedback not found.' });
      assert.strictEqual(theirs.userSeenReply, false, 'someone else\'s message must not be touched');

      const staffTry = await call('PUT', `/${String(theirs._id)}/seen`, { as: people.reportsEditor });
      assert.strictEqual(staffTry.statusCode, 404);
      assert.strictEqual(theirs.userSeenReply, false);

      const unknown = await call('PUT', `/${String(newId())}/seen`, { as: people.student });
      assert.strictEqual(unknown.statusCode, 404);

      db.lastSeenUpdate = null;
      for (const badId of ['abc', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '507f1f77bcf86cd79943901', '507f1f77bcf86cd7994390111', '%24ne', 'null', 'undefined', '[object%20Object]']) {
        const res = await call('PUT', `/${badId}/seen`, { as: people.student });
        assert.strictEqual(res.statusCode, 404, `id "${badId}" should be "not found"`);
        assert.deepStrictEqual(res.body, { message: 'Feedback not found.' });
      }
      assert.strictEqual(db.lastSeenUpdate, null, 'a malformed id must never reach the database');
    });

    console.log('--- 7. GET /admin (staff queue) ---');

    await test('Staff endpoints: students and editors without the reports permission get 403', async () => {
      resetRecorders();
      const target = seed(people.student, { message: 'Target of forbidden attempts.' });
      for (const who of [people.student, people.pendingStudent, people.rejectedStudent]) {
        const list = await call('GET', '/admin', { as: who });
        assert.strictEqual(list.statusCode, 403, `${who.name} must not read the queue`);
        assert.strictEqual(list.body.code, 'FORBIDDEN_ROLE');
        assert.strictEqual(list.body.feedback, undefined);

        const update = await call('PUT', `/admin/${String(target._id)}`, { as: who, body: { status: 'closed', reply: 'Not allowed' } });
        assert.strictEqual(update.statusCode, 403, `${who.name} must not update feedback`);
        assert.strictEqual(update.body.code, 'FORBIDDEN_ROLE');
      }

      const editorList = await call('GET', '/admin', { as: people.otherEditor });
      assert.strictEqual(editorList.statusCode, 403);
      assert.strictEqual(editorList.body.code, 'INSUFFICIENT_PERMISSIONS');
      assert.strictEqual(editorList.body.requiredPermission, 'reports.moderate');

      const editorUpdate = await call('PUT', `/admin/${String(target._id)}`, { as: people.otherEditor, body: { status: 'closed' } });
      assert.strictEqual(editorUpdate.statusCode, 403);
      assert.strictEqual(editorUpdate.body.code, 'INSUFFICIENT_PERMISSIONS');

      const oddPath = await call('PUT', '/admin/seen', { as: people.student });
      assert.strictEqual(oddPath.statusCode, 403);

      assert.strictEqual(target.status, 'new');
      assert.strictEqual(target.adminReply, '');
      assert.strictEqual(db.notifications.length, 0);
      assert.strictEqual(emails.toUser.length, 0);
    });

    await test('Staff endpoints: an admin and an editor holding reports.moderate are both let in', async () => {
      for (const who of [people.admin, people.secondAdmin, people.reportsEditor]) {
        const res = await call('GET', '/admin', { as: who });
        assert.strictEqual(res.statusCode, 200, `${who.name} should see the queue`);
        assert.ok(Array.isArray(res.body.feedback));
      }
    });

    await test('GET /admin: agreed shape, newest first, 20 per page by default, never more than 50', async () => {
      resetRecorders();
      db.feedback.length = 0;
      const plan = [
        ['new', 'bug', 30],
        ['in_progress', 'bug', 4],
        ['in_progress', 'idea', 6],
        ['answered', 'question', 15],
        ['closed', 'complaint', 7],
        ['closed', 'other', 3],
      ];
      let n = 0;
      for (const [status, category, howMany] of plan) {
        for (let i = 0; i < howMany; i += 1) {
          n += 1;
          seed(n % 2 ? people.student : people.otherStudent, { status, category, message: `Queue item ${n}` });
        }
      }
      assert.strictEqual(db.feedback.length, 65);

      const res = await call('GET', '/admin', { as: people.reportsEditor });
      assert.strictEqual(res.statusCode, 200);
      assert.deepStrictEqual(Object.keys(res.body).sort(), ['counts', 'feedback', 'pagination']);
      assert.strictEqual(res.body.feedback.length, 20);
      assert.strictEqual(res.body.feedback[0].message, 'Queue item 65');
      assert.strictEqual(res.body.feedback[19].message, 'Queue item 46');
      assert.deepStrictEqual(res.body.pagination, { page: 1, limit: 20, total: 65, pages: 4 });
      assert.deepStrictEqual(res.body.counts, { new: 30, in_progress: 10, answered: 15, closed: 10 });
      assert.ok(res.body.feedback.every((item) => item.userEmail && item.userName && item.user));

      const last = await call('GET', '/admin?page=4', { as: people.admin });
      assert.strictEqual(last.body.feedback.length, 5);
      assert.strictEqual(last.body.feedback[4].message, 'Queue item 1');
      assert.deepStrictEqual(last.body.pagination, { page: 4, limit: 20, total: 65, pages: 4 });

      const beyond = await call('GET', '/admin?page=9', { as: people.admin });
      assert.strictEqual(beyond.statusCode, 200);
      assert.deepStrictEqual(beyond.body.feedback, []);
      assert.strictEqual(beyond.body.pagination.total, 65);

      const big = await call('GET', '/admin?limit=500', { as: people.admin });
      assert.strictEqual(big.body.feedback.length, 50);
      assert.deepStrictEqual(big.body.pagination, { page: 1, limit: 50, total: 65, pages: 2 });

      const small = await call('GET', '/admin?limit=7&page=2', { as: people.admin });
      assert.strictEqual(small.body.feedback.length, 7);
      assert.strictEqual(small.body.feedback[0].message, 'Queue item 58');
      assert.deepStrictEqual(small.body.pagination, { page: 2, limit: 7, total: 65, pages: 10 });

      const nonsense = await call('GET', '/admin?limit=lots&page=-3', { as: people.admin });
      assert.deepStrictEqual(nonsense.body.pagination, { page: 1, limit: 20, total: 65, pages: 4 });
    });

    await test('GET /admin: status, "open" and category filters; counts stay steady across status tabs', async () => {
      const allCounts = { new: 30, in_progress: 10, answered: 15, closed: 10 };

      for (const [status, expected] of Object.entries(allCounts)) {
        const res = await call('GET', `/admin?status=${status}&limit=50`, { as: people.admin });
        assert.strictEqual(res.body.pagination.total, expected, `total for ${status}`);
        assert.ok(res.body.feedback.every((item) => item.status === status));
        assert.deepStrictEqual(res.body.counts, allCounts, 'status tab numbers must not change with the chosen tab');
      }

      const open = await call('GET', '/admin?status=open&limit=50', { as: people.admin });
      assert.strictEqual(open.body.pagination.total, 40);
      assert.strictEqual(open.body.feedback.length, 40);
      assert.ok(open.body.feedback.every((item) => ['new', 'in_progress'].includes(item.status)));
      assert.ok(open.body.feedback.some((item) => item.status === 'new'));
      assert.ok(open.body.feedback.some((item) => item.status === 'in_progress'));
      assert.deepStrictEqual(open.body.counts, allCounts);

      const bugs = await call('GET', '/admin?category=bug&limit=50', { as: people.admin });
      assert.strictEqual(bugs.body.pagination.total, 34);
      assert.ok(bugs.body.feedback.every((item) => item.category === 'bug'));
      assert.deepStrictEqual(bugs.body.counts, { new: 30, in_progress: 4, answered: 0, closed: 0 });

      const openIdeas = await call('GET', '/admin?status=open&category=idea', { as: people.admin });
      assert.strictEqual(openIdeas.body.pagination.total, 6);
      assert.ok(openIdeas.body.feedback.every((item) => item.category === 'idea' && item.status === 'in_progress'));
      assert.deepStrictEqual(openIdeas.body.counts, { new: 0, in_progress: 6, answered: 0, closed: 0 });

      const none = await call('GET', '/admin?status=answered&category=bug', { as: people.admin });
      assert.deepStrictEqual(none.body.feedback, []);
      assert.deepStrictEqual(none.body.pagination, { page: 1, limit: 20, total: 0, pages: 1 });

      for (const query of ['status=all', 'status=', 'status=whatever', 'category=praise', 'status=new&status=closed', 'category=bug&category=idea']) {
        const res = await call('GET', `/admin?${query}`, { as: people.admin });
        assert.strictEqual(res.statusCode, 200, query);
        assert.strictEqual(res.body.pagination.total, 65, query);
        assert.deepStrictEqual(res.body.counts, allCounts, query);
      }
    });

    console.log('--- 8. PUT /admin/:id (status and reply) ---');

    await test('PUT /admin/:id: malformed or unknown id gives 404; an empty or invalid request gives 400', async () => {
      resetRecorders();
      const item = seed(people.student, { message: 'Item for validation checks.' });
      const url = `/admin/${String(item._id)}`;
      const ip = '10.2.2.2';

      for (const badId of ['abc', '12345', 'zzzzzzzzzzzzzzzzzzzzzzzz', '507f1f77bcf86cd79943901', 'undefined']) {
        const res = await call('PUT', `/admin/${badId}`, { as: people.admin, body: { status: 'closed' }, ip });
        assert.strictEqual(res.statusCode, 404, `id "${badId}"`);
        assert.deepStrictEqual(res.body, { message: 'Feedback not found.' });
      }
      const unknown = await call('PUT', `/admin/${String(newId())}`, { as: people.admin, body: { reply: 'Hello' }, ip });
      assert.strictEqual(unknown.statusCode, 404);

      for (const body of [undefined, {}, { status: '' }, { reply: '' }, { reply: '    ' }, { status: null, reply: null }, { status: '', reply: '\n\n' }, { somethingElse: true }]) {
        const res = await call('PUT', url, { as: people.admin, body, ip });
        assert.strictEqual(res.statusCode, 400, `accepted ${JSON.stringify(body)}`);
        assert.strictEqual(res.body.message, 'Please choose a status or write a reply.');
      }

      for (const status of ['open', 'done', 'New', 'resolved', 5, ['closed'], { $ne: 'new' }, true]) {
        const res = await call('PUT', url, { as: people.admin, body: { status }, ip });
        assert.strictEqual(res.statusCode, 400, `accepted status ${JSON.stringify(status)}`);
        assert.strictEqual(res.body.message, 'Status must be new, in_progress, answered or closed.');
      }
      const mixed = await call('PUT', url, { as: people.admin, body: { status: 'finished', reply: 'A fine reply.' }, ip });
      assert.strictEqual(mixed.statusCode, 400);

      const tooLong = await call('PUT', url, { as: people.admin, body: { reply: 'r'.repeat(2001) }, ip });
      assert.strictEqual(tooLong.statusCode, 400);
      assert.match(tooLong.body.message, /too long/i);

      for (const reply of [42, { text: 'hi' }, ['hi'], true]) {
        const res = await call('PUT', url, { as: people.admin, body: { reply }, ip });
        assert.strictEqual(res.statusCode, 400, `accepted reply ${JSON.stringify(reply)}`);
        assert.strictEqual(res.body.message, 'Please write a reply.');
      }

      assert.strictEqual(item.status, 'new');
      assert.strictEqual(item.adminReply, '');
      assert.strictEqual(item.repliedBy, null);
      assert.strictEqual(db.notifications.length, 0);
      assert.strictEqual(emails.toUser.length, 0);
      assert.strictEqual(pushes.toUser.length, 0);
    });

    await test('Status only: the status changes and the user is not notified or emailed', async () => {
      resetRecorders();
      const item = seed(people.student, { message: 'Please look into this one.' });
      const url = `/admin/${String(item._id)}`;
      const ip = '10.3.3.3';

      for (const status of ['in_progress', 'closed', 'answered', 'new']) {
        const res = await call('PUT', url, { as: people.reportsEditor, body: { status }, ip });
        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(Object.keys(res.body).sort(), ['feedback', 'message']);
        assert.strictEqual(res.body.message, 'Feedback updated.');
        assert.strictEqual(res.body.feedback.status, status);
        assert.strictEqual(item.status, status);
      }
      const withBlankReply = await call('PUT', url, { as: people.admin, body: { status: 'in_progress', reply: '   ' }, ip });
      assert.strictEqual(withBlankReply.statusCode, 200);
      assert.strictEqual(item.status, 'in_progress');

      assert.strictEqual(item.adminReply, '');
      assert.strictEqual(item.repliedBy, null);
      assert.strictEqual(item.repliedByName, '');
      assert.strictEqual(item.repliedAt, null);
      assert.strictEqual(db.notifications.length, 0);
      assert.strictEqual(pushes.toUser.length, 0);
      assert.strictEqual(emails.toUser.length, 0);
    });

    await test('Reply only: saves the reply and who wrote it, marks it unread, sets "answered", notifies and emails the user', async () => {
      resetRecorders();
      const item = seed(people.student, {
        category: 'question',
        message: 'How do I export my saved papers?',
        status: 'in_progress',
        userSeenReply: true,
      });
      const longReply = `  Open your Library and choose Export.\r\n\r\n\r\n\r\n${'More detail. '.repeat(30)}  `;
      const before = Date.now();
      const res = await call('PUT', `/admin/${String(item._id)}`, { as: people.reportsEditor, body: { reply: longReply }, ip: '10.4.4.4' });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.message, 'Reply sent to the user.');

      const { feedback } = res.body;
      assert.ok(feedback.adminReply.startsWith('Open your Library and choose Export.\n\nMore detail.'));
      assert.ok(!feedback.adminReply.endsWith(' '));
      assert.strictEqual(feedback.repliedBy, String(people.reportsEditor._id));
      assert.strictEqual(feedback.repliedByName, 'Reports Editor');
      assert.ok(new Date(feedback.repliedAt).getTime() >= before - 5);
      assert.ok(new Date(feedback.repliedAt).getTime() <= Date.now() + 5);
      assert.strictEqual(feedback.userSeenReply, false);
      assert.strictEqual(feedback.status, 'answered');
      assert.strictEqual(feedback.message, 'How do I export my saved papers?');
      assert.strictEqual(feedback.user, String(people.student._id));
      assert.strictEqual(item.adminReply, feedback.adminReply);

      assert.strictEqual(db.notifications.length, 1);
      const notif = db.notifications[0];
      assert.strictEqual(String(notif.user), String(people.student._id));
      assert.strictEqual(notif.type, 'feedback_reply');
      assert.strictEqual(notif.title, 'Reply to your feedback');
      assert.ok(notif.message.startsWith('Open your Library and choose Export. More detail.'));
      assert.ok(notif.message.endsWith('…'));
      assert.strictEqual(notif.message.length, 161);
      assert.deepStrictEqual(notif.data, { feedbackId: String(item._id) });
      assert.strictEqual(notif.read, false);

      assert.strictEqual(pushes.toUser.length, 1);
      assert.strictEqual(pushes.toUser[0].userId, String(people.student._id));
      assert.strictEqual(pushes.toUser[0].event, 'notification:new');
      assert.strictEqual(pushes.toUser[0].payload, notif);
      assert.strictEqual(pushes.toAdmins.length, 0);
      assert.strictEqual(pushes.rooms.length, 0);

      assert.strictEqual(emails.toUser.length, 1);
      assert.strictEqual(emails.toAdmin.length, 0);
      assert.deepStrictEqual(emails.toUser[0], {
        userEmail: 'rafi@example.edu',
        userName: 'Rafi Ahmed',
        categoryLabel: FEEDBACK_CATEGORY_LABELS.question,
        originalMessage: 'How do I export my saved papers?',
        reply: feedback.adminReply,
      });
    });

    await test('A short reply is sent whole; a reply with a status keeps the status that was chosen', async () => {
      resetRecorders();
      const item = seed(people.otherStudent, { message: 'The dark mode toggle is hidden.' });
      const url = `/admin/${String(item._id)}`;
      const ip = '10.5.5.5';

      const closed = await call('PUT', url, { as: people.admin, body: { reply: 'Fixed, thank you.', status: 'closed' }, ip });
      assert.strictEqual(closed.statusCode, 200);
      assert.strictEqual(closed.body.feedback.status, 'closed');
      assert.strictEqual(closed.body.feedback.adminReply, 'Fixed, thank you.');
      assert.strictEqual(closed.body.feedback.repliedByName, 'Head Admin');
      assert.strictEqual(db.notifications[0].message, 'Fixed, thank you.');

      const inProgress = await call('PUT', url, { as: people.admin, body: { reply: 'Looking into it now.', status: 'in_progress' }, ip });
      assert.strictEqual(inProgress.body.feedback.status, 'in_progress');
      assert.strictEqual(inProgress.body.feedback.adminReply, 'Looking into it now.');

      const blankStatus = await call('PUT', url, { as: people.secondAdmin, body: { reply: 'All done.', status: '' }, ip });
      assert.strictEqual(blankStatus.body.feedback.status, 'answered');
      assert.strictEqual(blankStatus.body.feedback.repliedBy, String(people.secondAdmin._id));
      assert.strictEqual(blankStatus.body.feedback.repliedByName, 'Second Admin');

      assert.strictEqual(db.notifications.length, 3);
      assert.strictEqual(emails.toUser.length, 3);
      assert.ok(db.notifications.every((n) => String(n.user) === String(people.otherStudent._id)));
      assert.ok(emails.toUser.every((mail) => mail.userEmail === 'nadia@example.edu'));

      const tamper = await call('PUT', url, {
        as: people.admin,
        body: { status: 'closed', message: 'Rewritten by staff', user: String(people.student._id), userEmail: 'x@y.z', repliedByName: 'Somebody Else' },
        ip,
      });
      assert.strictEqual(tamper.statusCode, 200);
      assert.strictEqual(item.message, 'The dark mode toggle is hidden.');
      assert.strictEqual(String(item.user), String(people.otherStudent._id));
      assert.strictEqual(item.userEmail, 'nadia@example.edu');
      assert.strictEqual(item.repliedByName, 'Second Admin');
    });

    await test('Reply side effects failing (notification store, email) never fail the saved reply', async () => {
      resetRecorders();
      const item = seed(people.student, { message: 'Will the reply survive trouble?' });
      const url = `/admin/${String(item._id)}`;
      const ip = '10.6.6.6';
      const original = emailService.notifyUserFeedbackReply;

      let logged = await collectingErrors(async () => {
        db.failNotificationWrites = new Error('notification store is down');
        emailService.notifyUserFeedbackReply = () => {
          throw new Error('smtp exploded');
        };
        const res = await call('PUT', url, { as: people.admin, body: { reply: 'Yes, it will.' }, ip });
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.feedback.adminReply, 'Yes, it will.');
        assert.strictEqual(res.body.feedback.status, 'answered');
      });
      assert.ok(logged.some((line) => line.includes('[Feedback] Reply notification error:')));
      assert.ok(logged.some((line) => line.includes('[EmailService] Feedback reply email error:') && line.includes('smtp exploded')));
      assert.strictEqual(item.adminReply, 'Yes, it will.');
      assert.strictEqual(pushes.toUser.length, 0, 'nothing is pushed when the notification could not be stored');

      db.failNotificationWrites = null;
      logged = await collectingErrors(async () => {
        emailService.notifyUserFeedbackReply = async () => {
          throw new Error('smtp timed out');
        };
        const res = await call('PUT', url, { as: people.admin, body: { reply: 'Second answer.' }, ip });
        assert.strictEqual(res.statusCode, 200);
      });
      assert.ok(logged.some((line) => line.includes('smtp timed out')));

      emailService.notifyUserFeedbackReply = () => new Promise(() => {});
      const slow = await call('PUT', url, { as: people.admin, body: { reply: 'Third answer.' }, ip });
      assert.strictEqual(slow.statusCode, 200);
      emailService.notifyUserFeedbackReply = original;
      resetRecorders();
    });

    await test('When saving the reply fails the answer is 500, and the user is not notified or emailed', async () => {
      resetRecorders();
      const item = seed(people.student, { message: 'The save will fail for this one.' });
      const realSave = Feedback.prototype.save;
      const logged = await collectingErrors(async () => {
        Feedback.prototype.save = async () => {
          throw new Error('write concern failed on shard-7');
        };
        try {
          const res = await call('PUT', `/admin/${String(item._id)}`, { as: people.admin, body: { reply: 'This will not be stored.' }, ip: '10.7.7.7' });
          assert.strictEqual(res.statusCode, 500);
          assert.deepStrictEqual(res.body, { message: 'Failed to update feedback.' });
        } finally {
          Feedback.prototype.save = realSave;
        }
      });
      assert.ok(logged.some((line) => line.includes('[Feedback] Update error:') && line.includes('shard-7')));
      assert.strictEqual(db.notifications.length, 0);
      assert.strictEqual(pushes.toUser.length, 0);
      assert.strictEqual(emails.toUser.length, 0);
    });

    console.log('--- 9. Full round trip ---');

    await test('User writes, staff see it and reply, user sees an unread reply and marks it read', async () => {
      resetRecorders();
      db.feedback.length = 0;
      const writer = person({ name: 'Round Trip', email: 'round.trip@example.edu', status: 'pending' });
      peopleById.set(String(writer._id), writer);

      const sent = await call('POST', '/', { as: writer, body: { category: 'complaint', message: 'My verification has taken two weeks.', pageContext: 'topic-check' } });
      assert.strictEqual(sent.statusCode, 201);
      const id = sent.body.feedback._id;

      const queue = await call('GET', '/admin?status=open', { as: people.reportsEditor });
      assert.strictEqual(queue.body.pagination.total, 1);
      assert.strictEqual(queue.body.feedback[0]._id, id);
      assert.strictEqual(queue.body.feedback[0].userEmail, 'round.trip@example.edu');
      assert.strictEqual(queue.body.feedback[0].pageContext, 'topic-check');
      assert.deepStrictEqual(queue.body.counts, { new: 1, in_progress: 0, answered: 0, closed: 0 });

      const replied = await call('PUT', `/admin/${id}`, { as: people.reportsEditor, body: { reply: 'Sorry for the wait. You are approved now.' }, ip: '10.8.8.8' });
      assert.strictEqual(replied.statusCode, 200);

      const afterReply = await call('GET', '/admin?status=open', { as: people.admin });
      assert.strictEqual(afterReply.body.pagination.total, 0);
      assert.deepStrictEqual(afterReply.body.counts, { new: 0, in_progress: 0, answered: 1, closed: 0 });

      const mine = await call('GET', '/mine', { as: writer });
      assert.strictEqual(mine.body.feedback.length, 1);
      assert.strictEqual(mine.body.feedback[0].adminReply, 'Sorry for the wait. You are approved now.');
      assert.strictEqual(mine.body.feedback[0].status, 'answered');
      assert.strictEqual(mine.body.feedback[0].userSeenReply, false);

      const seen = await call('PUT', `/${id}/seen`, { as: writer });
      assert.strictEqual(seen.statusCode, 200);

      const mineAgain = await call('GET', '/mine', { as: writer });
      assert.strictEqual(mineAgain.body.feedback[0].userSeenReply, true);

      assert.deepStrictEqual((await call('DELETE', `/${id}`, { as: writer })).body, { unmatched: true });
      assert.deepStrictEqual((await call('GET', `/${id}`, { as: writer })).body, { unmatched: true });
      assert.deepStrictEqual((await call('DELETE', `/admin/${id}`, { as: people.admin })).body, { unmatched: true });
      assert.strictEqual(db.feedback.length, 1, 'there is no way to delete feedback through the API');
    });
  } finally {
    while (undo.length) undo.pop()();
    emailService.clearSentEmails();
  }

  console.log('\n===============================================================');
  console.log(`  ALL ${passed}/${total} USER FEEDBACK TESTS PASSED (100% OK)`);
  console.log('===============================================================');
}

module.exports = { runFeedbackTests };

if (require.main === module) {
  runFeedbackTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
