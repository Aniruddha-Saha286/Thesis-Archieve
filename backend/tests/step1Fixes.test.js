const assert = require('assert');
const { REPORT_ISSUE_TYPES, REPORT_ISSUE_LABELS, normalizeReportIssueType } = require('../utils/reportIssueType');
const { escapeRegex } = require('../utils/escapeRegex');
const { resolveTrustProxy } = require('../utils/trustProxy');
const Report = require('../models/Report');

function runStep1FixTests() {
  console.log('Testing: Report Categories, Safe Search Text & Proxy Setting...');
  let passed = 0;
  const check = (name, fn) => {
    fn();
    passed += 1;
    console.log(`  ✓ [PASS] ${name}`);
  };

  check('Every canonical report category passes through unchanged and has a label', () => {
    for (const type of REPORT_ISSUE_TYPES) {
      assert.strictEqual(normalizeReportIssueType(type), type);
      assert.ok(REPORT_ISSUE_LABELS[type], `missing label for ${type}`);
    }
  });

  check('Names the old report form sent are mapped instead of rejected', () => {
    assert.strictEqual(normalizeReportIssueType('broken_pdf'), 'dead-link');
    assert.strictEqual(normalizeReportIssueType('wrong_title'), 'metadata-inaccuracy');
    assert.strictEqual(normalizeReportIssueType('retracted'), 'retraction-unflagged');
    assert.strictEqual(normalizeReportIssueType('paywall'), 'paywall');
    assert.strictEqual(normalizeReportIssueType('  Dead-Link '), 'dead-link');
  });

  check('Unknown, empty or odd values become "other" so the report is still saved', () => {
    for (const value of ['something-new', '', null, undefined, 42, {}, ['dead-link', 'x']]) {
      assert.strictEqual(normalizeReportIssueType(value), 'other');
    }
  });

  check('The Report model accepts every category and rejects only invented ones', () => {
    for (const type of REPORT_ISSUE_TYPES) {
      const doc = new Report({ recordId: 'abc', title: 'T', description: 'd', issueType: type });
      const err = doc.validateSync();
      assert.strictEqual(err, undefined, `model rejected ${type}`);
    }
    const bad = new Report({ recordId: 'abc', title: 'T', description: 'd', issueType: 'broken_pdf' });
    assert.ok(bad.validateSync()?.errors?.issueType, 'model should still reject raw legacy names');
  });

  check('Search text with regex characters no longer throws and matches literally', () => {
    for (const text of ['(', 'C++', 'a[b', 'x{2', '\\', '*.pdf', 'what?', '^start$', 'a|b']) {
      const re = new RegExp(escapeRegex(text), 'i');
      assert.ok(re.test(`before ${text} after`), `did not match ${text}`);
    }
    assert.ok(!new RegExp(escapeRegex('a.c')).test('abc'));
    assert.strictEqual(escapeRegex(null), '');
    assert.strictEqual(escapeRegex('plain words'), 'plain words');
  });

  check('Proxy setting: on in production, off in development, by default', () => {
    assert.strictEqual(resolveTrustProxy({ NODE_ENV: 'production' }), 1);
    assert.strictEqual(resolveTrustProxy({ NODE_ENV: 'development' }), false);
    assert.strictEqual(resolveTrustProxy({}), false);
    assert.strictEqual(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '' }), 1);
  });

  check('Proxy setting: explicit values are respected and "true" never trusts every hop', () => {
    assert.strictEqual(resolveTrustProxy({ TRUST_PROXY: '2' }), 2);
    assert.strictEqual(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'false' }), false);
    assert.strictEqual(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: '0' }), false);
    assert.strictEqual(resolveTrustProxy({ TRUST_PROXY: 'true' }), 1);
    assert.strictEqual(resolveTrustProxy({ TRUST_PROXY: '999' }), 10);
    assert.strictEqual(resolveTrustProxy({ TRUST_PROXY: 'loopback, 10.0.0.0/8' }), 'loopback, 10.0.0.0/8');
  });

  console.log(`  ${passed} checks passed.`);
}

module.exports = { runStep1FixTests };

if (require.main === module) {
  runStep1FixTests();
}
