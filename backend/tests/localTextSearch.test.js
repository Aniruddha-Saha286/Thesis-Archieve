// Local archive text matching: multi-word queries must find theses that contain the words
// in any order, without changing single-word or exact-phrase behaviour.
const assert = require('assert');
const { buildTextSearchClause } = require('../services/providers/local');

// Minimal evaluator for the operators the clause uses ($or, $and, field: RegExp)
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((sub) => matches(doc, sub));
    if (key === '$and') return value.every((sub) => matches(doc, sub));
    if (value instanceof RegExp) return value.test(String(doc[key] == null ? '' : doc[key]));
    throw new Error(`Unsupported operator in test evaluator: ${key}`);
  });
}

function countRegexes(filter) {
  return Object.values(filter).reduce((sum, value) => {
    if (value instanceof RegExp) return sum + 1;
    if (Array.isArray(value)) return sum + value.reduce((s, sub) => s + countRegexes(sub), 0);
    return sum;
  }, 0);
}

function runLocalTextSearchTests() {
  console.log('Testing: Local Archive Multi-Word Text Matching...');
  let passed = 0;
  const check = (name, fn) => {
    fn();
    passed += 1;
    console.log(`  ✓ [PASS] ${name}`);
  };

  const thesis = {
    title: 'Sentiment analysis in Bangla using transformers',
    abstract: 'We study customer reviews from e-commerce platforms.',
    author: 'Nusrat Jahan',
    university: 'BRAC University',
    department: 'Computer Science and Engineering',
    publisher: '',
    catalogId: 'THESIS-2026-AB12CD34',
  };
  const other = { title: 'Soil nutrient mapping for rice paddies', abstract: 'Field study.', author: 'A. Rahman', university: 'BAU', department: 'Agronomy' };
  const find = (q, doc) => matches(doc, buildTextSearchClause(q));

  check('Empty or blank query adds no text filter', () => {
    assert.strictEqual(buildTextSearchClause(''), null);
    assert.strictEqual(buildTextSearchClause('   '), null);
    assert.strictEqual(buildTextSearchClause(undefined), null);
  });

  check('Single-word query keeps the original shape (7 fields, one regex each)', () => {
    const clause = buildTextSearchClause('Bangla');
    assert.deepStrictEqual(Object.keys(clause), ['$or']);
    assert.strictEqual(clause.$or.length, 7);
    assert.ok(find('Bangla', thesis));
    assert.ok(!find('Bangla', other));
  });

  check('Exact phrase still matches, in any searchable field', () => {
    assert.ok(find('Sentiment analysis in Bangla', thesis));
    assert.ok(find('BRAC University', thesis));
    assert.ok(find('THESIS-2026-AB12CD34', thesis));
  });

  check('Words in a different order now match (previously missed)', () => {
    assert.ok(find('bangla sentiment transformers', thesis));
    assert.ok(find('transformers bangla', thesis));
  });

  check('Words may be spread across title and abstract', () => {
    assert.ok(find('bangla reviews', thesis));
  });

  check('Two-word query needs both words', () => {
    assert.ok(!find('bangla robotics', thesis));
  });

  check('Longer queries tolerate a missing word but not most of them', () => {
    assert.ok(find('bangla sentiment robotics', thesis)); // 2 of 3
    assert.ok(!find('bangla robotics drones', thesis)); // 1 of 3
    assert.ok(find('bangla sentiment commerce reviews transformers', thesis)); // 5 of 5
    assert.ok(find('bangla sentiment commerce robotics drones', thesis)); // 3 of 5
    assert.ok(!find('bangla sentiment quantum robotics drones', thesis)); // 2 of 5
  });

  check('Unrelated records are not pulled in', () => {
    assert.ok(!find('bangla sentiment transformers', other));
    assert.ok(!find('bangla sentiment commerce reviews transformers', other));
  });

  check('Filler and very short words are ignored when counting', () => {
    assert.ok(find('the sentiment of the bangla', thesis));
    assert.ok(find('sentiment using bangla', thesis));
  });

  check('Regex special characters in the query are treated as plain text', () => {
    assert.doesNotThrow(() => buildTextSearchClause('c++ (templates) [draft] a.b*c?'));
    assert.ok(!find('(.*)+ [a-z]{9}', thesis));
    assert.ok(find('e-commerce', thesis));
  });

  check('Query size is bounded (at most 6 words considered)', () => {
    const clause = buildTextSearchClause('one1 two2 three3 four4 five5 six6 seven7 eight8 nine9 ten10');
    assert.ok(countRegexes(clause) <= 7 + 15 * 4 * 7, 'filter stays small');
    assert.strictEqual(clause.$or.length, 1 + 15); // phrase + C(6,4)
  });

  check('Bangla-script queries are tokenised correctly', () => {
    const doc = { title: 'বাংলা ভাষায় অনুভূতি বিশ্লেষণ', abstract: '' };
    assert.ok(find('অনুভূতি বাংলা', doc));
    assert.ok(!find('অনুভূতি রোবট', doc));
  });

  console.log('\n===============================================================');
  console.log(`  ALL ${passed}/${passed} LOCAL TEXT SEARCH TESTS PASSED (100% OK)`);
  console.log('===============================================================');
}

module.exports = { runLocalTextSearchTests };

if (require.main === module) {
  runLocalTextSearchTests();
}
