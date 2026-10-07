const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  parseOaiResponse,
  mapRecordToThesis,
  upsertHarvested,
  markHarvestedDeleted,
  harvestRepository,
  computeHarvestChecksum,
  buildUserAgent,
  buildListRecordsUrl,
  parseRetryAfter,
  cleanText,
  SKIP_REASONS,
  NEUTRAL_CATEGORY,
  NEUTRAL_DEGREE_TYPE,
  UNKNOWN_DEPARTMENT,
  SOURCE_DELETED_REASON,
  DEFAULT_DELAY_MS,
} = require('../services/repositoryHarvester');
const { listRepositories, getRepository } = require('../services/repositoryRegistry');
const { SUBJECT_CATALOG } = require('../services/subjectCatalog');

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'oai');
const fixture = (name) => fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');

const BRACU = getRepository('bracu');
const CONTACT = 'harvest-test@example.org';
const FIXED_NOW = new Date('2026-10-06T00:00:00Z');


function createFakeThesisModel(seed = []) {
  const docs = seed.map((doc) => structuredClone(doc));
  const writes = { create: 0, update: 0 };
  let nextId = 1;
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => doc[key] === value);

  return {
    docs,
    writes,
    findOne(filter) {
      const found = docs.find((doc) => matches(doc, filter));
      const copy = found ? structuredClone(found) : null;
      return { lean: async () => copy };
    },
    async create(doc) {
      if (doc.externalId && docs.some((existing) => existing.externalId === doc.externalId)) {
        throw new Error('E11000 duplicate key error: externalId');
      }
      writes.create += 1;
      const stored = { _id: `fake-${nextId}`, upvotes: 0, isPinned: false, ...structuredClone(doc) };
      nextId += 1;
      docs.push(stored);
      return stored;
    },
    async updateOne(filter, update) {
      const found = docs.find((doc) => matches(doc, filter));
      if (!found) return { matchedCount: 0 };
      writes.update += 1;
      Object.assign(found, structuredClone(update.$set));
      return { matchedCount: 1 };
    },
    byExternalId(externalId) {
      return docs.find((doc) => doc.externalId === externalId) || null;
    },
  };
}

function xmlResponse(body, status = 200, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status,
    headers: { get: (name) => (lower[name.toLowerCase()] === undefined ? null : lower[name.toLowerCase()]) },
    text: async () => body,
  };
}

function createFetchStub(sequence) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = sequence[Math.min(calls.length - 1, sequence.length - 1)];
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(url, init);
    return next;
  };
  return { fetchImpl, calls };
}

function createSleepRecorder() {
  const waits = [];
  return { waits, sleep: async (ms) => { waits.push(ms); } };
}

function generatedPage(ids, nextToken) {
  const records = ids.map((id) => `
    <record>
      <header><identifier>oai:dspace.bracu.ac.bd:10361/${id}</identifier><datestamp>2025-01-0${(id % 9) + 1}T00:00:00Z</datestamp><setSpec>col_10361_1</setSpec></header>
      <metadata><dim:dim xmlns:dim="http://www.dspace.org/xmlns/dspace/dim">
        <dim:field mdschema="dc" element="contributor" qualifier="author">Student, Number ${id}</dim:field>
        <dim:field mdschema="dc" element="contributor" qualifier="department">Department of Testing</dim:field>
        <dim:field mdschema="dc" element="date" qualifier="issued">2024</dim:field>
        <dim:field mdschema="dc" element="identifier" qualifier="uri">http://hdl.handle.net/10361/${id}</dim:field>
        <dim:field mdschema="dc" element="description" qualifier="abstract">Abstract of generated thesis number ${id}, long enough to be accepted.</dim:field>
        <dim:field mdschema="dc" element="title">Generated thesis number ${id}</dim:field>
        <dim:field mdschema="dc" element="type">Thesis</dim:field>
      </dim:dim></metadata>
    </record>`).join('');
  const token = nextToken === undefined ? '' : (nextToken === null ? '<resumptionToken completeListSize="9" cursor="6"/>' : `<resumptionToken completeListSize="9" cursor="0">${nextToken}</resumptionToken>`);
  return `<?xml version="1.0" encoding="UTF-8"?><OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"><responseDate>2026-10-05T00:00:00Z</responseDate><request verb="ListRecords">https://dspace.bracu.ac.bd/server/oai/request</request><ListRecords>${records}${token}</ListRecords></OAI-PMH>`;
}

function threeGeneratedPages() {
  return [
    xmlResponse(generatedPage([1, 2, 3], 'tok-2')),
    xmlResponse(generatedPage([4, 5, 6], 'tok-3')),
    xmlResponse(generatedPage([7, 8, 9], null)),
  ];
}

function mapFixtureRecord(file, index, repository = BRACU) {
  const record = parseOaiResponse(fixture(file)).records[index];
  return mapRecordToThesis(record, repository, { currentYear: 2026 });
}

async function runCli(main, argv) {
  const lines = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const code = await main(argv);
    return { code, output: lines.join('\n') };
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
}


async function runRepositoryHarvesterTests() {
  console.log('Testing: Repository Harvester (OAI-PMH parsing, mapping, save rules, polite paging)...');
  let passed = 0;
  const check = async (name, fn) => {
    await fn();
    passed += 1;
    console.log(`  ✓ [PASS] ${name}`);
  };


  await check('Parses a real-shape DSpace "dim" page: several records, several fields each', () => {
    const parsed = parseOaiResponse(fixture('bracu-dim-page1.xml'));
    assert.strictEqual(parsed.error, null);
    assert.strictEqual(parsed.records.length, 5);
    const first = parsed.records[0];
    assert.strictEqual(first.identifier, 'oai:dspace.bracu.ac.bd:10361/22810');
    assert.strictEqual(first.datestamp, '2026-07-16T04:21:00Z');
    assert.deepStrictEqual(first.setSpecs, ['com_10361_28391', 'com_10361_28390', 'com_10361_28388', 'col_10361_28396']);
    assert.strictEqual(first.deleted, false);
    assert.strictEqual(first.metadataFormat, 'dim');
    assert.deepStrictEqual(first.fields['dc.contributor.author'], ['Roy, Anika', 'Das, Mitu', 'Hasan, Sadia Binte']);
    assert.deepStrictEqual(first.fields['dc.contributor.advisor'], ['Bin Karim, Tahmid']);
    assert.deepStrictEqual(first.fields['dc.date.issued'], ['2023-11']);
    assert.deepStrictEqual(first.fields['bracu.degree.level'], ['Undergraduate']);
    assert.strictEqual(first.fields['dc.description'].length, 3, 'unqualified descriptions stay separate from the abstract');
    assert.strictEqual(first.fields['dc.description.abstract'].length, 1);
  });

  await check('Parses a page with a single record, single fields and a different namespace prefix', () => {
    const parsed = parseOaiResponse(fixture('oai_dc-single-record.xml'));
    assert.strictEqual(parsed.error, null);
    assert.strictEqual(parsed.records.length, 1, 'one <record> must still come back as a list of one');
    const only = parsed.records[0];
    assert.strictEqual(only.identifier, 'oai:repository.example.edu.bd:123456789/0042', 'identifier must stay text ("0042" not 42)');
    assert.deepStrictEqual(only.setSpecs, ['col_123456789_7'], 'one <setSpec> must still be a list');
    assert.strictEqual(only.metadataFormat, 'oai_dc');
    assert.deepStrictEqual(only.fields['dc.title'], ['Arsenic removal from groundwater using low-cost iron oxide filters']);
    assert.deepStrictEqual(only.fields['dc.creator'], ['Hossain, Mahmuda']);
    assert.strictEqual(parsed.resumptionToken, null);
    assert.strictEqual(parsed.completeListSize, null);
  });

  await check('Parses the oai_dc version of the same real record (unlabelled contributors and dates)', () => {
    const parsed = parseOaiResponse(fixture('bracu-oai_dc.xml'));
    assert.strictEqual(parsed.records.length, 2);
    const first = parsed.records[0];
    assert.strictEqual(first.metadataFormat, 'oai_dc');
    assert.deepStrictEqual(first.fields['dc.contributor'], ['Bin Karim, Tahmid', 'Department of Mathematics and Natural Sciences']);
    assert.deepStrictEqual(first.fields['dc.date'], ['2024-05-14T04:06:06Z', '2024-05-14T04:06:06Z', '©2023', '2023-11']);
    assert.strictEqual(first.fields['dc.description'].length, 8);
  });

  await check('Recognises a deleted header (no metadata) without dropping it', () => {
    const parsed = parseOaiResponse(fixture('bracu-dim-page1.xml'));
    const deleted = parsed.records[2];
    assert.strictEqual(deleted.identifier, 'oai:dspace.bracu.ac.bd:10361/9999');
    assert.strictEqual(deleted.deleted, true);
    assert.strictEqual(deleted.metadataFormat, null);
    assert.deepStrictEqual(deleted.fields, {});
    assert.strictEqual(parsed.records.filter((record) => record.deleted).length, 1);
  });

  await check('Reads the resumption token: present, empty on the last page, absent on a short list', () => {
    const page1 = parseOaiResponse(fixture('bracu-dim-page1.xml'));
    assert.strictEqual(page1.resumptionToken, 'dim/2025-09-01T00:00:00Z///100');
    assert.strictEqual(page1.completeListSize, 6);

    const lastPage = parseOaiResponse(fixture('bracu-dim-page2.xml'));
    assert.strictEqual(lastPage.resumptionToken, null, 'an empty <resumptionToken/> means "no more pages"');
    assert.strictEqual(lastPage.completeListSize, 6);
    assert.strictEqual(lastPage.records.length, 1);

    const shortList = parseOaiResponse(fixture('bracu-oai_dc.xml'));
    assert.strictEqual(shortList.resumptionToken, null);
    assert.strictEqual(shortList.completeListSize, null);
  });

  await check('Reports OAI <error> elements by code (noRecordsMatch, badResumptionToken)', () => {
    const none = parseOaiResponse(fixture('error-noRecordsMatch.xml'));
    assert.deepStrictEqual(none.error, { code: 'noRecordsMatch', message: 'No matches for the query' });
    assert.deepStrictEqual(none.records, []);
    assert.strictEqual(none.resumptionToken, null);

    const badToken = parseOaiResponse(fixture('error-badResumptionToken.xml'));
    assert.strictEqual(badToken.error.code, 'badResumptionToken');
    assert.deepStrictEqual(badToken.records, []);
  });

  await check('Malformed, truncated, empty and non-OAI input comes back as an error, never a throw', () => {
    const whole = fixture('bracu-dim-page1.xml');
    const truncated = parseOaiResponse(whole.slice(0, Math.floor(whole.length / 2)));
    assert.strictEqual(truncated.error.code, 'malformedXml', 'a half-delivered page must not be read as a short page');
    assert.deepStrictEqual(truncated.records, []);

    assert.strictEqual(parseOaiResponse('<OAI-PMH><ListRecords><record></ListRecords></OAI-PMH>').error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse('').error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse('   ').error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse(null).error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse(undefined).error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse('Service Unavailable').error.code, 'malformedXml');
    assert.strictEqual(parseOaiResponse('<html><body><h1>Maintenance</h1></body></html>').error.code, 'notOaiPmh');
  });


  await check('Maps the real-shape thesis (dim) to a complete Thesis object', () => {
    const { thesis, skipReason } = mapFixtureRecord('bracu-dim-page1.xml', 0);
    assert.strictEqual(skipReason, null);
    assert.strictEqual(thesis.title, 'Effect of free DNA of environment surface water on bacterial biofilm formation');
    assert.strictEqual(thesis.author, 'Anika Roy, Mitu Das, Sadia Binte Hasan', '"Family, Given" is shown as "Given Family"');
    assert.deepStrictEqual(thesis.authors, [
      { name: 'Anika Roy', affiliation: 'BRAC University' },
      { name: 'Mitu Das', affiliation: 'BRAC University' },
      { name: 'Sadia Binte Hasan', affiliation: 'BRAC University' },
    ]);
    assert.strictEqual(thesis.advisor, 'Tahmid Bin Karim');
    assert.strictEqual(thesis.department, 'Department of Mathematics and Natural Sciences');
    assert.strictEqual(thesis.university, 'BRAC University');
    assert.strictEqual(thesis.publisher, 'BRAC University');
    assert.strictEqual(thesis.countryCode, 'BD');
    assert.strictEqual(thesis.publishedYear, 2023);
    assert.strictEqual(thesis.degreeType, 'B.Sc. Thesis');
    assert.strictEqual(thesis.publicationType, 'thesis');
    assert.strictEqual(thesis.isOpenAccess, true);
    assert.strictEqual(thesis.sourceUrl, 'https://hdl.handle.net/10361/22810');
    assert.strictEqual(thesis.externalId, 'oai:dspace.bracu.ac.bd:10361/22810');
    assert.strictEqual(thesis.sourceRepository, 'bracu');
    assert.strictEqual(thesis.sourceRepositoryName, 'BRAC University Institutional Repository');
    assert.ok(thesis.sourceRights.startsWith('Brac University theses are protected by copyright.'));
    assert.strictEqual(thesis.sourceUpdatedAt.toISOString(), '2026-07-16T04:21:00.000Z');
    assert.strictEqual(thesis.origin, 'harvest');
    assert.strictEqual(thesis.status, 'approved', 'local search only returns approved records');
    assert.ok(!('pdfUrl' in thesis), 'a landing page is never stored as a PDF link');
    assert.ok(!('submittedBy' in thesis), 'no site user is named as the depositor');
    assert.strictEqual(
      thesis.abstract,
      'Bacteriophages, commonly referred to as bacterial viruses, have long been recognized as natural adversaries of bacteria. They find application in medical settings for eliminating bacterial infections. This study seeks to explore whether the free DNA introduced by Bacteriophages influences the formation of bacterial biofilms.',
      'the "&#xd;" line breaks inside the abstract become single spaces'
    );
  });

  await check('oai_dc fallback finds the same advisor, department, abstract, year and link without labels', () => {
    const viaDim = mapFixtureRecord('bracu-dim-page1.xml', 0).thesis;
    const viaDc = mapFixtureRecord('bracu-oai_dc.xml', 0).thesis;
    for (const field of ['title', 'abstract', 'author', 'advisor', 'department', 'publishedYear', 'sourceUrl', 'degreeType', 'publicationType', 'externalId', 'publisher']) {
      assert.deepStrictEqual(viaDc[field], viaDim[field], `oai_dc and dim must agree on ${field}`);
    }
    assert.strictEqual(viaDc.advisor, 'Tahmid Bin Karim', 'the person among dc:contributor is the advisor');
    assert.strictEqual(viaDc.department, 'Department of Mathematics and Natural Sciences', 'the "Department of ..." contributor is the department');
    assert.ok(!viaDc.abstract.includes('partial fulfillment'), 'cataloguing notes are not mistaken for the abstract');
    assert.strictEqual(viaDc.isOpenAccess, null, 'oai_dc does not say; nothing is claimed');
  });

  await check('Keeps theses and dissertations, skips every other kind of record', () => {
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 1).skipReason, SKIP_REASONS.NOT_THESIS, 'Internship Report');
    assert.strictEqual(mapFixtureRecord('bracu-oai_dc.xml', 1).skipReason, SKIP_REASONS.NOT_THESIS, 'Drawings');
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 1).thesis, null);

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[0];
    const withType = (type) => mapRecordToThesis({ ...record, fields: { ...record.fields, 'dc.type': type ? [type] : [] } }, BRACU);
    for (const type of ['Thesis', 'Doctoral thesis', "Master's Dissertation", 'info:eu-repo/semantics/masterThesis', 'Electronic Theses']) {
      assert.ok(withType(type).thesis, `"${type}" must be kept`);
    }
    for (const type of ['Article', 'Research Report', 'Journal', 'Newspaper article', 'Book chapter', null]) {
      assert.strictEqual(withType(type).skipReason, SKIP_REASONS.NOT_THESIS, `"${type}" must be skipped`);
    }
    const optIn = mapRecordToThesis({ ...record, fields: { ...record.fields, 'dc.type': [] } }, { ...BRACU, treatAllAsThesis: true });
    assert.ok(optIn.thesis);
  });

  await check('Skips records with a missing required field instead of inventing text', () => {
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 3).skipReason, SKIP_REASONS.NO_ABSTRACT, 'thesis with only a cataloguing note');
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 2).skipReason, SKIP_REASONS.DELETED_AT_SOURCE);

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[0];
    const without = (...keys) => {
      const fields = { ...record.fields };
      for (const key of keys) delete fields[key];
      return mapRecordToThesis({ ...record, fields }, BRACU);
    };
    assert.strictEqual(without('dc.title').skipReason, SKIP_REASONS.NO_TITLE);
    assert.strictEqual(without('dc.contributor.author').skipReason, SKIP_REASONS.NO_AUTHOR);
    assert.strictEqual(without('dc.description.abstract').skipReason, SKIP_REASONS.NO_ABSTRACT);

    const stub = mapRecordToThesis({ ...record, fields: { ...record.fields, 'dc.description.abstract': ['N/A'] } }, BRACU);
    assert.strictEqual(stub.skipReason, SKIP_REASONS.NO_ABSTRACT, 'a stub such as "N/A" is not an abstract');

    const noLink = mapRecordToThesis({ ...record, identifier: 'urn:local:42', fields: { ...record.fields, 'dc.identifier.uri': [] } }, BRACU);
    assert.strictEqual(noLink.skipReason, SKIP_REASONS.NO_SOURCE_LINK, 'a record that cannot link back is not copied');

    assert.strictEqual(mapRecordToThesis({ ...record, metadataFormat: 'unknown', fields: {} }, BRACU).skipReason, SKIP_REASONS.UNSUPPORTED_METADATA);
    assert.strictEqual(mapRecordToThesis({ ...record, metadataFormat: null, fields: {} }, BRACU).skipReason, SKIP_REASONS.NO_METADATA);
    assert.throws(() => mapRecordToThesis(record, null), /repository/);
  });

  await check('Optional fields that are missing stay honest: no advisor, placeholder department, neutral degree', () => {
    const single = mapFixtureRecord('oai_dc-single-record.xml', 0, { key: 'example', name: 'Example University of Engineering', countryCode: 'BD' });
    assert.ok(single.thesis);
    assert.strictEqual(single.thesis.advisor, null, 'the university listed as contributor is not an advisor');
    assert.strictEqual(single.thesis.department, UNKNOWN_DEPARTMENT);
    assert.strictEqual(single.thesis.publisher, 'Example University of Engineering', 'falls back to the registry name');
    assert.strictEqual(single.thesis.sourceRepositoryName, 'Example University of Engineering');
    assert.strictEqual(single.thesis.sourceRights, '');

    const record = parseOaiResponse(fixture('bracu-dim-page2.xml')).records[0];
    const fields = { ...record.fields };
    delete fields['dc.description.degree'];
    const noDegree = mapRecordToThesis({ ...record, fields }, BRACU, { currentYear: 2026 }).thesis;
    assert.strictEqual(noDegree.degreeType, NEUTRAL_DEGREE_TYPE, 'the model default "M.Sc. Thesis" must not be applied by accident');
    assert.strictEqual(noDegree.publicationType, 'thesis');
  });

  await check('Cleans HTML entities, tags and whitespace without damaging "<" and ">" in real text', () => {
    const { thesis } = mapFixtureRecord('bracu-dim-page1.xml', 4);
    assert.strictEqual(thesis.title, 'Sentiment analysis of Bangla social media posts & comments using transformer models');
    assert.strictEqual(
      thesis.abstract,
      'Social media posts in Bangla mix scripts & dialects, so tools built for English do badly on them. We fine-tune a transformer on 40,000 labelled posts and reach an F1 score of 0.91 (p < 0.05, n > 30) on a held-out set, using CO2-aware training schedules.'
    );

    assert.strictEqual(cleanText('  A &amp; B\r\n  C&#xd;D &#169; 2023 &quot;x&quot;&nbsp;y  '), 'A & B C D © 2023 "x" y');
    assert.strictEqual(cleanText('<p>One</p><p>Two<br/>Three</p>'), 'One Two Three');
    assert.strictEqual(cleanText('H<sub>2</sub>O and <em>E. coli</em>'), 'H2O and E. coli');
    assert.strictEqual(cleanText('if a < b and c > d then'), 'if a < b and c > d then');
    assert.strictEqual(cleanText('R&D &unknownthing; kept'), 'R&D &unknownthing; kept');
    assert.strictEqual(cleanText(null), '');
    assert.strictEqual(cleanText(undefined), '');
  });

  await check('Maps the degree level only when it is stated', () => {
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 0).thesis.degreeType, 'B.Sc. Thesis');
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 4).thesis.degreeType, 'M.Sc. Thesis');
    const doctoral = mapFixtureRecord('bracu-dim-page2.xml', 0).thesis;
    assert.strictEqual(doctoral.degreeType, 'Ph.D. Dissertation');
    assert.strictEqual(doctoral.publicationType, 'dissertation');
    assert.strictEqual(mapFixtureRecord('oai_dc-single-record.xml', 0).thesis.degreeType, "Master's Thesis", 'from dc:type "Masters Thesis"');

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[0];
    const base = { ...record.fields };
    delete base['dc.description.degree'];
    delete base['bracu.degree.level'];
    const degreeOf = (extra) => mapRecordToThesis({ ...record, fields: { ...base, ...extra } }, BRACU).thesis;

    assert.strictEqual(degreeOf({ 'dc.description': ['Catalogued from PDF version of thesis.'] }).degreeType, NEUTRAL_DEGREE_TYPE);
    assert.strictEqual(degreeOf({ 'dc.description': ['This thesis is submitted in partial fulfillment of the requirements for the degree of Master of Arts in English, 2020.'] }).degreeType, "Master's Thesis");
    assert.strictEqual(degreeOf({ 'dc.description': [], 'thesis.degree.name': ['Master of Philosophy'] }).degreeType, 'M.Phil. Thesis');
    assert.strictEqual(degreeOf({ 'dc.description': [], 'bracu.degree.level': ['Undergraduate'] }).degreeType, "Bachelor's Thesis");
    assert.strictEqual(degreeOf({ 'dc.description': [], 'dc.type': ['Doctoral thesis'] }).publicationType, 'dissertation');
    assert.strictEqual(degreeOf({ 'dc.description': [], 'dc.type': ['Dissertation'] }).publicationType, 'dissertation');

    const about = degreeOf({
      'dc.description': [],
      'dc.description.degree': ['Bachelor of Social Science in Economics'],
      'dc.description.abstract': ['This study looks at why PhD students in doctoral programmes drop out before finishing, using interviews at three universities.'],
    });
    assert.strictEqual(about.degreeType, "Bachelor's Thesis");
    assert.strictEqual(about.publicationType, 'thesis');
  });

  await check('Chooses the year the thesis was issued, not the year it was uploaded', () => {
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 0).thesis.publishedYear, 2023, 'issued 2023-11, uploaded 2024');
    assert.strictEqual(mapFixtureRecord('bracu-dim-page1.xml', 4).thesis.publishedYear, 2022, 'issued 2022-09, uploaded 2024');
    assert.strictEqual(mapFixtureRecord('bracu-oai_dc.xml', 0).thesis.publishedYear, 2023, 'oai_dc: the plain date wins over the timestamps');
    assert.strictEqual(mapFixtureRecord('bracu-dim-page2.xml', 0).thesis.publishedYear, 2019, 'no issue date: earliest upload date is the best evidence');
    assert.strictEqual(mapFixtureRecord('oai_dc-single-record.xml', 0).thesis.publishedYear, 2019, 'oai_dc with only a timestamp');

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[0];
    const yearOf = (dates) => {
      const fields = Object.fromEntries(Object.entries(record.fields).filter(([key]) => !key.startsWith('dc.date')));
      return mapRecordToThesis({ ...record, fields: { ...fields, ...dates } }, BRACU, { currentYear: 2026 }).thesis.publishedYear;
    };
    assert.strictEqual(yearOf({ 'dc.date.copyright': ['©2021'], 'dc.date.accessioned': ['2024-01-01T00:00:00Z'] }), 2021, 'copyright year when no issue date');
    assert.strictEqual(yearOf({ 'dc.date.issued': ['2999'], 'dc.date.accessioned': ['2024-01-01T00:00:00Z'] }), 2024, 'an impossible year is ignored');
    assert.strictEqual(yearOf({ 'dc.date.issued': ['n.d.'] }), null, 'no usable date: the year stays empty');
    assert.strictEqual(yearOf({}), null);
  });

  await check('Links back to the original record through its handle', () => {
    const real = mapFixtureRecord('bracu-oai_dc.xml', 0).thesis;
    assert.strictEqual(real.sourceUrl, 'https://hdl.handle.net/10361/22810', 'the handle is chosen, not "ID 00000001"');
    assert.strictEqual(mapFixtureRecord('oai_dc-single-record.xml', 0).thesis.sourceUrl, 'http://repository.example.edu.bd/handle/123456789/0042');

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[0];
    const derived = mapRecordToThesis({ ...record, fields: { ...record.fields, 'dc.identifier.uri': [] } }, BRACU).thesis;
    assert.strictEqual(derived.sourceUrl, 'https://hdl.handle.net/10361/22810', 'read from "oai:<host>:<handle>" when no URL is listed');
  });

  await check('Assigns a discipline only on a clear keyword match, otherwise the neutral category', () => {
    const nlp = mapFixtureRecord('bracu-dim-page1.xml', 4).thesis;
    assert.strictEqual(nlp.category, 'Natural Language Processing');
    assert.deepStrictEqual(nlp.subjects, [{ id: 'nlp', label: 'Natural Language Processing', shortLabel: 'NLP', provenance: 'provider_mapped', sourceId: null }]);
    assert.strictEqual(mapFixtureRecord('bracu-dim-page2.xml', 0).thesis.subjects[0].id, 'biomedical');

    const biology = mapFixtureRecord('bracu-dim-page1.xml', 0).thesis;
    assert.strictEqual(biology.category, NEUTRAL_CATEGORY, '"Bacteria", "Water", "Biofilms" match no discipline keyword');
    assert.deepStrictEqual(biology.subjects, []);

    const record = parseOaiResponse(fixture('bracu-dim-page1.xml')).records[4];
    const categoryOf = (subjects) => {
      const fields = Object.fromEntries(Object.entries(record.fields).filter(([key]) => !key.startsWith('dc.subject')));
      return mapRecordToThesis({ ...record, fields: { ...fields, 'dc.subject': subjects } }, BRACU).thesis.category;
    };
    assert.strictEqual(categoryOf(['Machine learning', 'Sentiment analysis']), NEUTRAL_CATEGORY, 'one keyword each for two disciplines is a tie');
    assert.strictEqual(categoryOf(['Market segmentation', 'Consensus building']), NEUTRAL_CATEGORY, 'everyday words are not trusted');
    assert.strictEqual(categoryOf([]), NEUTRAL_CATEGORY);
    assert.strictEqual(categoryOf(['Microfinance', 'Rural credit']), 'Development Economics');

    const labels = new Set(SUBJECT_CATALOG.map((subject) => subject.label));
    assert.ok(labels.has(nlp.category), 'a mapped category is always one of the site disciplines');
  });

  await check('A mapped record satisfies the real Thesis model and keeps its fingerprint through Mongoose', async () => {
    const Thesis = require('../models/Thesis');
    for (const [file, index] of [['bracu-dim-page1.xml', 0], ['bracu-dim-page1.xml', 4], ['bracu-dim-page2.xml', 0], ['bracu-oai_dc.xml', 0]]) {
      const { thesis } = mapFixtureRecord(file, index);
      const doc = new Thesis({ ...thesis, harvestChecksum: computeHarvestChecksum(thesis), harvestedAt: FIXED_NOW });
      await assert.doesNotReject(() => doc.validate(), `validation failed for ${file}#${index}`);
      assert.strictEqual(doc.origin, 'harvest');
      assert.strictEqual(doc.status, 'approved');
      assert.strictEqual(doc.submittedBy, null);
      assert.strictEqual(doc.pdfUrl, '');
      assert.strictEqual(computeHarvestChecksum(doc.toObject()), doc.harvestChecksum, 'fingerprint must survive model casting');
    }
    const deposit = new Thesis({ title: 'T', abstract: 'A', university: 'U', department: 'D', author: 'X' });
    assert.strictEqual(deposit.origin, 'deposit');
    assert.strictEqual(deposit.externalId, undefined, 'no externalId at all, so the sparse unique index ignores deposits');
    assert.strictEqual(deposit.status, 'pending');
    await assert.rejects(() => new Thesis({ ...mapFixtureRecord('bracu-dim-page1.xml', 0).thesis, origin: 'scraped' }).validate(), /origin/);
    const externalIdIndex = Thesis.schema.indexes().find(([keys]) => keys.externalId === 1);
    assert.ok(externalIdIndex && externalIdIndex[1].unique && externalIdIndex[1].sparse, 'externalId needs a unique sparse index');
  });


  const realThesis = () => mapFixtureRecord('bracu-dim-page1.xml', 0).thesis;

  await check('Upsert inserts a new harvested record as approved, with its bookkeeping fields', async () => {
    const model = createFakeThesisModel();
    const outcome = await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    assert.deepStrictEqual(outcome, { action: 'inserted' });
    assert.strictEqual(model.docs.length, 1);
    const stored = model.docs[0];
    assert.strictEqual(stored.origin, 'harvest');
    assert.strictEqual(stored.status, 'approved');
    assert.strictEqual(stored.approvedAt.getTime(), FIXED_NOW.getTime());
    assert.strictEqual(stored.harvestedAt.getTime(), FIXED_NOW.getTime());
    assert.strictEqual(stored.externalId, 'oai:dspace.bracu.ac.bd:10361/22810');
    assert.strictEqual(stored.harvestChecksum, computeHarvestChecksum(realThesis()));
    assert.ok(!('submittedBy' in stored) && !('approvedBy' in stored), 'no user is credited');
  });

  await check('Upsert leaves an unchanged record alone (no write at all)', async () => {
    const model = createFakeThesisModel();
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    const again = await upsertHarvested(model, realThesis(), { now: new Date('2026-11-01T00:00:00Z') });
    assert.deepStrictEqual(again, { action: 'unchanged' });
    assert.deepStrictEqual(model.writes, { create: 1, update: 0 });
    assert.strictEqual(model.docs.length, 1);
    assert.strictEqual(model.docs[0].harvestedAt.getTime(), FIXED_NOW.getTime());
  });

  await check('Upsert updates a record that changed at the source, and nothing but its content', async () => {
    const model = createFakeThesisModel();
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    Object.assign(model.docs[0], { upvotes: 7, isPinned: true, catalogId: 'THESIS-2026-ABCD1234', approvedBy: 'admin-1' });

    const changed = { ...realThesis(), abstract: `${realThesis().abstract} Corrected by the library.`, advisor: 'Tahmid Bin Karim, Nusrat Alam', sourceUpdatedAt: new Date('2026-09-01T00:00:00Z') };
    const later = new Date('2026-11-01T00:00:00Z');
    const outcome = await upsertHarvested(model, changed, { now: later });
    assert.deepStrictEqual(outcome, { action: 'updated' });
    assert.strictEqual(model.docs.length, 1, 'updated in place, never duplicated');

    const stored = model.docs[0];
    assert.ok(stored.abstract.endsWith('Corrected by the library.'));
    assert.strictEqual(stored.advisor, 'Tahmid Bin Karim, Nusrat Alam');
    assert.strictEqual(stored.sourceUpdatedAt.toISOString(), '2026-09-01T00:00:00.000Z');
    assert.strictEqual(stored.harvestedAt.getTime(), later.getTime());
    assert.strictEqual(stored.harvestChecksum, computeHarvestChecksum(changed));
    assert.strictEqual(stored.upvotes, 7);
    assert.strictEqual(stored.isPinned, true);
    assert.strictEqual(stored.catalogId, 'THESIS-2026-ABCD1234');
    assert.strictEqual(stored.approvedBy, 'admin-1');
    assert.strictEqual(stored.status, 'approved');
    assert.strictEqual(stored.approvedAt.getTime(), FIXED_NOW.getTime(), 'an update never re-approves');

    assert.deepStrictEqual(await upsertHarvested(model, changed, { now: later }), { action: 'unchanged' });
  });

  await check('Do-not-overwrite: a record an admin edited by hand is never overwritten', async () => {
    const model = createFakeThesisModel();
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    model.docs[0].title = 'Effect of free DNA on biofilm formation (title corrected by editor)';
    model.docs[0].category = 'Biomedical & Clinical Science';
    const before = structuredClone(model.docs[0]);

    assert.deepStrictEqual(await upsertHarvested(model, realThesis(), { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.ADMIN_EDITED });
    const changedAtSource = { ...realThesis(), abstract: 'A completely different abstract from the source repository, long enough.' };
    assert.deepStrictEqual(await upsertHarvested(model, changedAtSource, { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.ADMIN_EDITED });
    assert.deepStrictEqual(model.docs[0], before, 'the edited record is byte-for-byte untouched');
    assert.strictEqual(model.writes.update, 0);
  });

  await check('Do-not-overwrite: an admin-rejected record stays rejected and is not re-created', async () => {
    const model = createFakeThesisModel();
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    Object.assign(model.docs[0], { status: 'rejected', rejectionReason: 'Duplicate of a deposited thesis', rejectedBy: 'admin-1', rejectedAt: FIXED_NOW });
    const before = structuredClone(model.docs[0]);

    const changedAtSource = { ...realThesis(), abstract: 'A completely different abstract from the source repository, long enough.' };
    for (const mapped of [realThesis(), changedAtSource]) {
      assert.deepStrictEqual(await upsertHarvested(model, mapped, { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.ADMIN_REJECTED });
    }
    assert.strictEqual(model.docs.length, 1);
    assert.deepStrictEqual(model.docs[0], before);
  });

  await check('Do-not-overwrite: a thesis deposited on this site is never touched', async () => {
    const deposit = {
      _id: 'deposit-1', title: 'My own thesis', abstract: 'Written by a student of this site.', author: 'Site Student',
      university: 'BRAC University', department: 'CSE', status: 'pending', origin: 'deposit', submittedBy: 'user-9',
      externalId: 'oai:dspace.bracu.ac.bd:10361/22810',
    };
    const legacy = { ...deposit, _id: 'deposit-2', externalId: 'oai:dspace.bracu.ac.bd:10361/23003' };
    delete legacy.origin;
    const model = createFakeThesisModel([deposit, legacy]);

    assert.deepStrictEqual(await upsertHarvested(model, realThesis(), { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.NOT_HARVEST_ORIGIN });
    assert.deepStrictEqual(await upsertHarvested(model, mapFixtureRecord('bracu-dim-page1.xml', 4).thesis, { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.NOT_HARVEST_ORIGIN });
    assert.deepStrictEqual(await markHarvestedDeleted(model, deposit.externalId, { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.NOT_HARVEST_ORIGIN });
    assert.deepStrictEqual(model.docs, [deposit, legacy]);
    assert.deepStrictEqual(model.writes, { create: 0, update: 0 });

    await assert.rejects(() => upsertHarvested(model, { ...realThesis(), origin: 'deposit' }), /origin "harvest"/);
    await assert.rejects(() => upsertHarvested(model, { ...realThesis(), externalId: '' }), /externalId/);
  });

  await check('Dry run reports the same decisions and writes nothing', async () => {
    const empty = createFakeThesisModel();
    assert.deepStrictEqual(await upsertHarvested(empty, realThesis(), { dryRun: true }), { action: 'inserted' });
    assert.strictEqual(empty.docs.length, 0);

    const model = createFakeThesisModel();
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });
    const before = structuredClone(model.docs);
    const changed = { ...realThesis(), abstract: `${realThesis().abstract} Changed.` };
    assert.deepStrictEqual(await upsertHarvested(model, changed, { dryRun: true }), { action: 'updated' });
    assert.deepStrictEqual(await upsertHarvested(model, realThesis(), { dryRun: true }), { action: 'unchanged' });
    assert.deepStrictEqual(await markHarvestedDeleted(model, realThesis().externalId, { dryRun: true }), { action: 'deleted' });
    assert.deepStrictEqual(model.docs, before);
    assert.deepStrictEqual(model.writes, { create: 1, update: 0 });
  });

  await check('A record deleted at the source is hidden, not destroyed, and returns if the source restores it', async () => {
    const model = createFakeThesisModel();
    const externalId = realThesis().externalId;
    await upsertHarvested(model, realThesis(), { now: FIXED_NOW });

    assert.deepStrictEqual(await markHarvestedDeleted(model, externalId, { now: FIXED_NOW }), { action: 'deleted' });
    assert.strictEqual(model.docs.length, 1, 'the row is kept');
    assert.strictEqual(model.docs[0].status, 'rejected', 'no longer returned by search');
    assert.strictEqual(model.docs[0].rejectionReason, SOURCE_DELETED_REASON);
    assert.ok(model.docs[0].sourceDeletedAt instanceof Date);
    assert.deepStrictEqual(await markHarvestedDeleted(model, externalId, { now: FIXED_NOW }), { action: 'unchanged' });

    assert.deepStrictEqual(await upsertHarvested(model, realThesis(), { now: FIXED_NOW }), { action: 'updated' });
    assert.strictEqual(model.docs[0].status, 'approved');
    assert.strictEqual(model.docs[0].sourceDeletedAt, null);
    assert.strictEqual(model.docs[0].rejectionReason, '');

    assert.deepStrictEqual(await markHarvestedDeleted(model, 'oai:dspace.bracu.ac.bd:10361/never-seen', { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.DELETED_AT_SOURCE });

    Object.assign(model.docs[0], { status: 'rejected', rejectedBy: 'admin-1', rejectionReason: 'Out of scope' });
    assert.deepStrictEqual(await markHarvestedDeleted(model, externalId, { now: FIXED_NOW }), { action: 'skipped', reason: SKIP_REASONS.ADMIN_REJECTED });
    assert.strictEqual(model.docs[0].rejectionReason, 'Out of scope');
  });


  await check('Pages with the resumption token and pauses one second between requests', async () => {
    const { fetchImpl, calls } = createFetchStub([xmlResponse(fixture('bracu-dim-page1.xml')), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const { sleep, waits } = createSleepRecorder();
    const model = createFakeThesisModel();
    const progress = [];

    const summary = await harvestRepository({
      repository: BRACU, from: '2025-09-01', fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT, siteUrl: '',
      onProgress: (event) => progress.push(event), now: () => FIXED_NOW,
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, 'https://dspace.bracu.ac.bd/server/oai/request?verb=ListRecords&metadataPrefix=dim&from=2025-09-01');
    assert.strictEqual(
      calls[1].url,
      'https://dspace.bracu.ac.bd/server/oai/request?verb=ListRecords&resumptionToken=dim%2F2025-09-01T00%3A00%3A00Z%2F%2F%2F100',
      'a resumption token must be the only argument besides the verb'
    );
    assert.deepStrictEqual(waits, [DEFAULT_DELAY_MS], 'exactly one pause, between the two requests');
    assert.strictEqual(DEFAULT_DELAY_MS, 1000);

    assert.strictEqual(summary.fetched, 6);
    assert.strictEqual(summary.inserted, 3);
    assert.strictEqual(summary.updated, 0);
    assert.strictEqual(summary.unchanged, 0);
    assert.strictEqual(summary.deleted, 0);
    assert.deepStrictEqual(summary.skipped, { 'not-thesis': 1, 'deleted-at-source': 1, 'no-abstract': 1 });
    assert.deepStrictEqual(summary.errors, []);
    assert.strictEqual(summary.lastResumptionToken, null);
    assert.strictEqual(summary.complete, true);
    assert.strictEqual(summary.requests, 2);
    assert.strictEqual(summary.completeListSize, 6);
    assert.strictEqual(summary.metadataPrefix, 'dim');
    assert.deepStrictEqual(model.docs.map((doc) => doc.externalId), [
      'oai:dspace.bracu.ac.bd:10361/22810', 'oai:dspace.bracu.ac.bd:10361/23003', 'oai:dspace.bracu.ac.bd:10361/23004',
    ]);
    assert.deepStrictEqual(progress.filter((event) => event.event === 'page').map((event) => [event.page, event.fetched]), [[1, 5], [2, 6]]);

    const second = createFetchStub([xmlResponse(fixture('bracu-dim-page1.xml')), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const again = await harvestRepository({ repository: BRACU, from: '2025-09-01', fetchImpl: second.fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT });
    assert.strictEqual(again.inserted, 0);
    assert.strictEqual(again.unchanged, 3);
    assert.strictEqual(model.docs.length, 3);
  });

  await check('Sends an honest User-Agent with the site name and the contact address', async () => {
    const { fetchImpl, calls } = createFetchStub([xmlResponse(fixture('error-noRecordsMatch.xml'))]);
    const { sleep } = createSleepRecorder();
    await harvestRepository({ repository: BRACU, fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, siteUrl: 'https://thesis-archive.example.org' });

    const { headers } = calls[0].init;
    assert.strictEqual(headers['User-Agent'], 'TheThesisArchiveHarvester/1.0 (The Thesis Archive; +https://thesis-archive.example.org; mailto:harvest-test@example.org)');
    assert.strictEqual(headers.From, CONTACT);
    assert.strictEqual(calls[0].init.method, 'GET');
    assert.ok(calls[0].init.signal, 'every request carries a timeout signal');

    const saved = { email: process.env.HARVEST_CONTACT_EMAIL, site: process.env.HARVEST_SITE_URL };
    try {
      process.env.HARVEST_CONTACT_EMAIL = 'librarian-contact@example.org';
      delete process.env.HARVEST_SITE_URL;
      assert.strictEqual(buildUserAgent(), 'TheThesisArchiveHarvester/1.0 (The Thesis Archive; mailto:librarian-contact@example.org)');

      delete process.env.HARVEST_CONTACT_EMAIL;
      assert.throws(() => buildUserAgent(), /HARVEST_CONTACT_EMAIL/);
      const silent = createFetchStub([xmlResponse(fixture('error-noRecordsMatch.xml'))]);
      await assert.rejects(() => harvestRepository({ repository: BRACU, fetchImpl: silent.fetchImpl, dryRun: true, sleep }), /HARVEST_CONTACT_EMAIL/);
      assert.strictEqual(silent.calls.length, 0, 'no anonymous request is ever sent');
      assert.throws(() => buildUserAgent('not-an-email'), /HARVEST_CONTACT_EMAIL/);
    } finally {
      if (saved.email === undefined) delete process.env.HARVEST_CONTACT_EMAIL; else process.env.HARVEST_CONTACT_EMAIL = saved.email;
      if (saved.site === undefined) delete process.env.HARVEST_SITE_URL; else process.env.HARVEST_SITE_URL = saved.site;
    }
  });

  await check('The pause between requests is configurable (option, then registry, then default)', async () => {
    const run = async (extra, repository = BRACU) => {
      const { fetchImpl } = createFetchStub(threeGeneratedPages());
      const { sleep, waits } = createSleepRecorder();
      await harvestRepository({ repository, fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, ...extra });
      return waits;
    };
    assert.deepStrictEqual(await run({}), [1000, 1000], 'three requests, two pauses, none before the first');
    assert.deepStrictEqual(await run({ delayMs: 2500 }), [2500, 2500]);
    assert.deepStrictEqual(await run({}, { ...BRACU, requestDelayMs: 4000 }), [4000, 4000]);
    assert.deepStrictEqual(await run({ delayMs: 1500 }, { ...BRACU, requestDelayMs: 4000 }), [1500, 1500]);
  });

  await check('Honours HTTP 503 Retry-After, then carries on', async () => {
    const busy = xmlResponse('<html><body>Service Unavailable</body></html>', 503, { 'Retry-After': '7' });
    const { fetchImpl, calls } = createFetchStub([busy, xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const { sleep, waits } = createSleepRecorder();
    const waiting = [];
    const summary = await harvestRepository({
      repository: BRACU, fetchImpl, dryRun: true, sleep, contactEmail: CONTACT,
      onProgress: (event) => { if (event.event === 'waiting') waiting.push(event); },
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, calls[1].url, 'the same request is repeated');
    assert.deepStrictEqual(waits, [7000], 'waits exactly as long as the repository asked');
    assert.deepStrictEqual(summary.errors, []);
    assert.strictEqual(summary.fetched, 1);
    assert.strictEqual(summary.requests, 1, 'a retry is the same request, not a new page');
    assert.strictEqual(waiting.length, 1);
    assert.strictEqual(waiting[0].waitMs, 7000);

    assert.strictEqual(parseRetryAfter('120'), 120000);
    assert.strictEqual(parseRetryAfter('Wed, 21 Oct 2026 07:28:30 GMT', Date.parse('2026-10-21T07:28:00Z')), 30000);
    assert.strictEqual(parseRetryAfter('Wed, 21 Oct 2020 07:28:30 GMT', Date.parse('2026-10-21T07:28:00Z')), 0);
    assert.strictEqual(parseRetryAfter('soon'), null);
    assert.strictEqual(parseRetryAfter(null), null);
  });

  await check('Gives up after the retry limit and reports where to resume', async () => {
    const busy = xmlResponse('busy', 503, { 'Retry-After': '2' });
    const { fetchImpl, calls } = createFetchStub([xmlResponse(generatedPage([1, 2, 3], 'tok-2')), busy]);
    const { sleep, waits } = createSleepRecorder();
    const model = createFakeThesisModel();
    const summary = await harvestRepository({ repository: BRACU, fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT, maxRetries: 2 });

    assert.strictEqual(calls.length, 1 + 3, 'page 1, then page 2 tried once plus two retries');
    assert.deepStrictEqual(waits, [1000, 2000, 2000]);
    assert.strictEqual(summary.errors.length, 1);
    assert.match(summary.errors[0], /HTTP 503/);
    assert.strictEqual(summary.errorCount, 1);
    assert.strictEqual(summary.complete, false);
    assert.strictEqual(summary.lastResumptionToken, 'tok-2', 'the page that failed is the one to ask for again');
    assert.strictEqual(summary.inserted, 3, 'what was read before the failure is kept');

    const veryBusy = createFetchStub([xmlResponse('busy', 503, { 'Retry-After': '86400' })]);
    const second = createSleepRecorder();
    const stopped = await harvestRepository({ repository: BRACU, fetchImpl: veryBusy.fetchImpl, dryRun: true, sleep: second.sleep, contactEmail: CONTACT });
    assert.strictEqual(veryBusy.calls.length, 1);
    assert.deepStrictEqual(second.waits, []);
    assert.strictEqual(stopped.errors.length, 1);

    const noHint = createFetchStub([xmlResponse('busy', 503), xmlResponse('busy', 503), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const third = createSleepRecorder();
    const recovered = await harvestRepository({ repository: BRACU, fetchImpl: noHint.fetchImpl, dryRun: true, sleep: third.sleep, contactEmail: CONTACT });
    assert.deepStrictEqual(third.waits, [5000, 10000]);
    assert.deepStrictEqual(recovered.errors, []);
  });

  await check('Retries network errors and timeouts, but not a 404', async () => {
    const flaky = createFetchStub([new Error('ECONNRESET'), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const first = createSleepRecorder();
    const recovered = await harvestRepository({ repository: BRACU, fetchImpl: flaky.fetchImpl, dryRun: true, sleep: first.sleep, contactEmail: CONTACT });
    assert.strictEqual(flaky.calls.length, 2);
    assert.deepStrictEqual(first.waits, [5000]);
    assert.deepStrictEqual(recovered.errors, []);
    assert.strictEqual(recovered.fetched, 1);

    let hangingCalls = 0;
    const hangingFetch = (url, init) => new Promise((resolve, reject) => {
      hangingCalls += 1;
      init.signal.addEventListener('abort', () => {
        const error = new Error('This operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
    const second = createSleepRecorder();
    const timedOut = await harvestRepository({ repository: BRACU, fetchImpl: hangingFetch, dryRun: true, sleep: second.sleep, contactEmail: CONTACT, timeoutMs: 15, maxRetries: 1 });
    assert.strictEqual(hangingCalls, 2);
    assert.strictEqual(timedOut.errors.length, 1);
    assert.match(timedOut.errors[0], /timed out after 15 ms/);
    assert.strictEqual(timedOut.complete, false);

    const gone = createFetchStub([xmlResponse('Not Found', 404)]);
    const third = createSleepRecorder();
    const notFound = await harvestRepository({ repository: BRACU, fetchImpl: gone.fetchImpl, dryRun: true, sleep: third.sleep, contactEmail: CONTACT });
    assert.strictEqual(gone.calls.length, 1, 'asking again cannot fix a 404');
    assert.deepStrictEqual(third.waits, []);
    assert.match(notFound.errors[0], /HTTP 404/);
  });

  await check('Stops at maxRecords and returns a token that is safe to resume from', async () => {
    const midPage = createFetchStub(threeGeneratedPages());
    const model = createFakeThesisModel();
    const { sleep } = createSleepRecorder();
    const summary = await harvestRepository({ repository: BRACU, fetchImpl: midPage.fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT, maxRecords: 4 });
    assert.strictEqual(summary.fetched, 4);
    assert.strictEqual(summary.inserted, 4);
    assert.strictEqual(model.docs.length, 4);
    assert.strictEqual(midPage.calls.length, 2, 'page 3 is never requested');
    assert.strictEqual(summary.complete, false);
    assert.strictEqual(summary.lastResumptionToken, 'tok-2');

    const pageEnd = createFetchStub(threeGeneratedPages());
    const exact = await harvestRepository({ repository: BRACU, fetchImpl: pageEnd.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, maxRecords: 3 });
    assert.strictEqual(exact.fetched, 3);
    assert.strictEqual(pageEnd.calls.length, 1);
    assert.strictEqual(exact.lastResumptionToken, 'tok-2');
    assert.strictEqual(exact.complete, false);

    const firstPage = createFetchStub(threeGeneratedPages());
    const small = await harvestRepository({ repository: BRACU, fetchImpl: firstPage.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, maxRecords: 2 });
    assert.strictEqual(small.fetched, 2);
    assert.strictEqual(small.lastResumptionToken, null);
    assert.strictEqual(small.complete, false);

    const mixed = createFetchStub([xmlResponse(fixture('bracu-dim-page1.xml')), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const counted = await harvestRepository({ repository: BRACU, fetchImpl: mixed.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, maxRecords: 3 });
    assert.strictEqual(counted.fetched, 3);
    assert.strictEqual(counted.inserted, 1);
    assert.deepStrictEqual(counted.skipped, { 'not-thesis': 1, 'deleted-at-source': 1 });

    const resumed = createFetchStub([xmlResponse(generatedPage([4, 5, 6], 'tok-3')), xmlResponse(generatedPage([7, 8, 9], null))]);
    const rest = await harvestRepository({ repository: BRACU, from: '2025-01-01', fetchImpl: resumed.fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT, resumptionToken: 'tok-2' });
    assert.strictEqual(resumed.calls[0].url, 'https://dspace.bracu.ac.bd/server/oai/request?verb=ListRecords&resumptionToken=tok-2');
    assert.strictEqual(rest.complete, true);
    assert.strictEqual(rest.unchanged, 1, 'record 4 was already stored by the first run');
    assert.strictEqual(rest.inserted, 5);
    assert.strictEqual(model.docs.length, 9, 'all nine records, none twice');
  });

  await check('Treats noRecordsMatch as "nothing new", other OAI errors and broken pages as failures', async () => {
    const { sleep } = createSleepRecorder();
    const nothing = createFetchStub([xmlResponse(fixture('error-noRecordsMatch.xml'))]);
    const empty = await harvestRepository({ repository: BRACU, from: '2025-06-01', until: '2025-06-03', fetchImpl: nothing.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT });
    assert.strictEqual(nothing.calls[0].url, 'https://dspace.bracu.ac.bd/server/oai/request?verb=ListRecords&metadataPrefix=dim&from=2025-06-01&until=2025-06-03');
    assert.deepStrictEqual(empty.errors, []);
    assert.strictEqual(empty.fetched, 0);
    assert.strictEqual(empty.complete, true);

    const expired = createFetchStub([xmlResponse(fixture('error-badResumptionToken.xml'))]);
    const bad = await harvestRepository({ repository: BRACU, fetchImpl: expired.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT, resumptionToken: 'stale' });
    assert.strictEqual(bad.errors.length, 1);
    assert.match(bad.errors[0], /badResumptionToken/);
    assert.strictEqual(bad.complete, false);

    const whole = fixture('bracu-dim-page1.xml');
    const cut = createFetchStub([xmlResponse(whole.slice(0, 3000))]);
    const broken = await harvestRepository({ repository: BRACU, fetchImpl: cut.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT });
    assert.match(broken.errors[0], /malformedXml/);
    assert.strictEqual(broken.fetched, 0, 'nothing from a half-delivered page is stored');

    await assert.rejects(() => harvestRepository({ repository: BRACU, from: '01/01/2024', fetchImpl: nothing.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT }), /Invalid from date/);
    await assert.rejects(() => harvestRepository({ repository: BRACU, from: '2024-01-01', until: '2024-02-01T00:00:00Z', fetchImpl: nothing.fetchImpl, dryRun: true, sleep, contactEmail: CONTACT }), /same format/);
    await assert.rejects(() => harvestRepository({ repository: BRACU, fetchImpl: nothing.fetchImpl, sleep, contactEmail: CONTACT }), /ThesisModel/);
  });

  await check('Falls back to oai_dc when the repository does not offer the richer format', async () => {
    const { fetchImpl, calls } = createFetchStub([xmlResponse(fixture('error-cannotDisseminateFormat.xml')), xmlResponse(fixture('bracu-oai_dc.xml'))]);
    const { sleep, waits } = createSleepRecorder();
    const summary = await harvestRepository({ repository: BRACU, fetchImpl, dryRun: true, sleep, contactEmail: CONTACT });
    assert.ok(calls[0].url.includes('metadataPrefix=dim'));
    assert.ok(calls[1].url.includes('metadataPrefix=oai_dc'));
    assert.deepStrictEqual(waits, [1000], 'the second attempt is still a polite one');
    assert.strictEqual(summary.metadataPrefix, 'oai_dc');
    assert.deepStrictEqual(summary.errors, []);
    assert.strictEqual(summary.inserted, 1);
    assert.deepStrictEqual(summary.skipped, { 'not-thesis': 1 });

    assert.strictEqual(
      buildListRecordsUrl('http://example.edu.bd/oai/request', { metadataPrefix: 'oai_dc', from: '2024-01-01', set: 'col_1_2', resumptionToken: null }),
      'http://example.edu.bd/oai/request?verb=ListRecords&metadataPrefix=oai_dc&from=2024-01-01&set=col_1_2'
    );
  });

  await check('Dry run through the whole loop writes nothing and returns a few mapped samples', async () => {
    const pages = () => [xmlResponse(fixture('bracu-dim-page1.xml')), xmlResponse(fixture('bracu-dim-page2.xml'))];
    const { sleep } = createSleepRecorder();
    const model = createFakeThesisModel();
    const withModel = await harvestRepository({ repository: BRACU, fetchImpl: createFetchStub(pages()).fetchImpl, ThesisModel: model, dryRun: true, sleep, contactEmail: CONTACT, sampleLimit: 2 });
    assert.strictEqual(withModel.dryRun, true);
    assert.strictEqual(withModel.inserted, 3);
    assert.deepStrictEqual(model.writes, { create: 0, update: 0 });
    assert.strictEqual(model.docs.length, 0);
    assert.strictEqual(withModel.samples.length, 2);
    assert.strictEqual(withModel.samples[0].externalId, 'oai:dspace.bracu.ac.bd:10361/22810');

    const noModel = await harvestRepository({ repository: BRACU, fetchImpl: createFetchStub(pages()).fetchImpl, dryRun: true, sleep, contactEmail: CONTACT });
    assert.strictEqual(noModel.inserted, 3);
    assert.strictEqual(noModel.samples.length, 3);

    const live = await harvestRepository({ repository: BRACU, fetchImpl: createFetchStub(pages()).fetchImpl, ThesisModel: createFakeThesisModel(), sleep, contactEmail: CONTACT });
    assert.deepStrictEqual(live.samples, [], 'a real run does not carry samples around');
  });

  await check('The loop hides records the source deleted and survives one failing record', async () => {
    const { sleep } = createSleepRecorder();
    const known = { ...mapFixtureRecord('bracu-dim-page1.xml', 0).thesis, externalId: 'oai:dspace.bracu.ac.bd:10361/9999' };
    const model = createFakeThesisModel();
    await upsertHarvested(model, known, { now: FIXED_NOW });

    const realCreate = model.create.bind(model);
    model.create = async (doc) => {
      if (doc.externalId.endsWith('/23003')) throw new Error('Thesis validation failed: simulated');
      return realCreate(doc);
    };

    const { fetchImpl } = createFetchStub([xmlResponse(fixture('bracu-dim-page1.xml')), xmlResponse(fixture('bracu-dim-page2.xml'))]);
    const summary = await harvestRepository({ repository: BRACU, fetchImpl, ThesisModel: model, sleep, contactEmail: CONTACT, now: () => FIXED_NOW });
    assert.strictEqual(summary.deleted, 1);
    assert.strictEqual(model.byExternalId('oai:dspace.bracu.ac.bd:10361/9999').status, 'rejected');
    assert.strictEqual(summary.errorCount, 1);
    assert.match(summary.errors[0], /10361\/23003: Thesis validation failed/);
    assert.strictEqual(summary.inserted, 2, 'the records after the failing one are still stored');
    assert.strictEqual(summary.complete, true);
    assert.deepStrictEqual(summary.skipped, { 'not-thesis': 1, 'no-abstract': 1 });
  });


  await check('Registry: BRAC University is enabled on its confirmed endpoint; unverified entries are disabled', () => {
    const repositories = listRepositories();
    const keys = repositories.map((repo) => repo.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'keys must be unique');
    for (const repo of repositories) {
      for (const field of ['key', 'name', 'countryCode', 'oaiBaseUrl', 'metadataPrefix', 'notes']) {
        assert.ok(typeof repo[field] === 'string' && repo[field].length > 0, `${repo.key} is missing ${field}`);
      }
      assert.strictEqual(typeof repo.enabled, 'boolean');
      assert.strictEqual(repo.countryCode, 'BD');
      assert.ok(Array.isArray(repo.sets));
      assert.ok(/^https?:\/\/[^?\s]+$/.test(repo.oaiBaseUrl), `${repo.key} base URL must not contain a query string`);
      if (/UNVERIFIED/.test(repo.notes)) assert.strictEqual(repo.enabled, false, `${repo.key} is unverified and must be disabled`);
      if (repo.enabled) assert.ok(/CONFIRMED LIVE/.test(repo.notes), `${repo.key} is enabled, so its notes must say what was confirmed`);
    }
    assert.strictEqual(BRACU.enabled, true);
    assert.strictEqual(BRACU.name, 'BRAC University');
    assert.strictEqual(BRACU.oaiBaseUrl, 'https://dspace.bracu.ac.bd/server/oai/request');
    assert.strictEqual(BRACU.metadataPrefix, 'dim');
    assert.strictEqual(getRepository('BRACU').key, 'bracu');
    assert.strictEqual(getRepository('does-not-exist'), null);
    getRepository('bracu').sets.push('tampered');
    assert.deepStrictEqual(getRepository('bracu').sets, [], 'callers get copies, not the registry itself');
  });

  await check('Command line: refuses a disabled repository without --force, rejects unknown options', async () => {
    const { parseArgs, main } = require('../scripts/harvestRepository');
    assert.deepStrictEqual(
      parseArgs(['--repo', 'bracu', '--from', '2024-01-01', '--max', '500', '--dry-run']),
      { repo: 'bracu', from: '2024-01-01', max: '500', 'dry-run': true }
    );
    assert.deepStrictEqual(parseArgs(['--repo=bracu', '--list']), { repo: 'bracu', list: true });
    assert.throws(() => parseArgs(['--dryrun']), /Unknown option/, 'a typo must not silently become a real run');
    assert.throws(() => parseArgs(['--repo']), /needs a value/);
    assert.throws(() => parseArgs(['--repo', '--dry-run']), /needs a value/);

    const disabled = listRepositories().find((repo) => !repo.enabled);
    assert.ok(disabled, 'the registry lists at least one unverified candidate');

    const saved = { email: process.env.HARVEST_CONTACT_EMAIL, mongo: process.env.MONGODB_URI };
    try {
      delete process.env.HARVEST_CONTACT_EMAIL;
      delete process.env.MONGODB_URI;

      const refused = await runCli(main, ['--repo', disabled.key, '--dry-run']);
      assert.strictEqual(refused.code, 1);
      assert.match(refused.output, /is not enabled/);
      assert.match(refused.output, /--force/);

      const forced = await runCli(main, ['--repo', disabled.key, '--dry-run', '--force']);
      assert.strictEqual(forced.code, 1);
      assert.ok(!/is not enabled/.test(forced.output), '--force passes the enabled check');
      assert.match(forced.output, /HARVEST_CONTACT_EMAIL/, 'and stops at the next gate');

      const listed = await runCli(main, ['--list']);
      assert.strictEqual(listed.code, 0);
      assert.match(listed.output, /bracu\s+ENABLED/);
      assert.match(listed.output, new RegExp(`${disabled.key}\\s+disabled`));

      assert.strictEqual((await runCli(main, ['--repo', 'no-such-repo', '--dry-run'])).code, 1);
      assert.strictEqual((await runCli(main, ['--repo', 'bracu', '--max', 'many'])).code, 1);
      assert.strictEqual((await runCli(main, [])).code, 1);

      process.env.HARVEST_CONTACT_EMAIL = CONTACT;
      const noDatabase = await runCli(main, ['--repo', 'bracu']);
      assert.strictEqual(noDatabase.code, 1);
      assert.match(noDatabase.output, /MONGODB_URI/, 'a live run without a database address fails before any request');
    } finally {
      if (saved.email === undefined) delete process.env.HARVEST_CONTACT_EMAIL; else process.env.HARVEST_CONTACT_EMAIL = saved.email;
      if (saved.mongo === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = saved.mongo;
    }
  });

  console.log(`✓ All Repository Harvester tests passed successfully (${passed} checks).`);
  return passed;
}

module.exports = { runRepositoryHarvesterTests };

if (require.main === module) {
  runRepositoryHarvesterTests().catch((err) => {
    console.error('\n✗ TEST FAILURE ENCOUNTERED:');
    console.error(err);
    process.exitCode = 1;
  });
}
