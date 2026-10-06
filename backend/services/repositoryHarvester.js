/**
 * Repository Harvester
 *
 * Copies thesis catalogue records (title, abstract, author, advisor, department, year and a link
 * back) from university repositories into the local archive, using OAI-PMH. OAI-PMH is the
 * protocol repositories publish for exactly this purpose, so this is the polite, supported way
 * to do it: no page scraping.
 *
 * What it never does:
 *   - It never downloads or re-hosts a PDF. A harvested record only points back to the original.
 *   - It never invents text. A record without a real title, author or abstract is skipped and counted.
 *   - It never changes a thesis a student deposited here, or one an admin edited or rejected.
 *
 * The file is split in four layers so each one can be tested on its own:
 *   1. parseOaiResponse     text in, plain objects out            (no network, no database)
 *   2. mapRecordToThesis    one OAI record -> one Thesis-shaped object  (no network, no database)
 *   3. upsertHarvested      decides insert / update / leave alone (talks to the model it is given)
 *   4. harvestRepository    the loop: fetch a page, wait, fetch the next (network and clock are injected)
 */

const crypto = require('crypto');
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { SUBJECT_CATALOG } = require('./subjectCatalog');

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const SITE_NAME = 'The Thesis Archive';
const HARVESTER_VERSION = '1.0';

const DEFAULT_DELAY_MS = 1000; // pause between two requests to the same repository
const DEFAULT_TIMEOUT_MS = 30000; // give up on one request after 30 seconds
const DEFAULT_MAX_RETRIES = 3; // extra attempts per request after the first one fails
const DEFAULT_RETRY_BACKOFF_MS = 5000; // first wait after a failure without Retry-After; doubles each time
const MAX_RETRY_AFTER_MS = 10 * 60 * 1000; // a repository asking us to wait longer than this ends the run
const MAX_STORED_ERRORS = 50; // keep the summary readable when thousands of records fail the same way

// Used when a thesis-type record gives no degree level. The model default is "M.Sc. Thesis",
// which would be a made-up claim for a harvested record, so we always set this neutral value instead.
const NEUTRAL_DEGREE_TYPE = 'Thesis';

// Same neutral value the deposit form uses (routes/thesis.js). The record normaliser treats it as
// "no discipline chosen" and may still infer one from the title at display time.
const NEUTRAL_CATEGORY = 'Other Disciplines';

// Thesis.department is a required field for theses. Some repositories do not record it at all.
// Dropping an otherwise complete thesis for that would lose most of such a repository, so we store
// this honest placeholder instead of guessing a department.
const UNKNOWN_DEPARTMENT = 'Department not stated';

// Written into rejectionReason when the source repository withdraws a record we had copied.
const SOURCE_DELETED_REASON = 'Withdrawn from the source repository (reported as deleted over OAI-PMH).';

const SKIP_REASONS = Object.freeze({
  DELETED_AT_SOURCE: 'deleted-at-source',
  NO_METADATA: 'no-metadata',
  UNSUPPORTED_METADATA: 'unsupported-metadata',
  NOT_THESIS: 'not-thesis',
  NO_TITLE: 'no-title',
  NO_AUTHOR: 'no-author',
  NO_ABSTRACT: 'no-abstract',
  NO_SOURCE_LINK: 'no-source-link',
  NOT_HARVEST_ORIGIN: 'not-harvest-origin',
  ADMIN_REJECTED: 'admin-rejected',
  ADMIN_EDITED: 'admin-edited',
});

// The fields the harvester owns on a harvested record. Three things depend on this one list:
//   - these are the only content fields an update writes,
//   - the fingerprint ("harvestChecksum") is computed from exactly these,
//   - so "did an admin change this record by hand?" means "do these fields still match the
//     fingerprint we stored when we last wrote them?".
// Adding a field here changes every fingerprint: existing harvested records would then look
// hand-edited and stop updating. Only do that together with a migration that recomputes them.
const HARVESTED_CONTENT_FIELDS = Object.freeze([
  'title',
  'abstract',
  'author',
  'authors',
  'advisor',
  'university',
  'countryCode',
  'department',
  'category',
  'subjects',
  'degreeType',
  'publicationType',
  'publisher',
  'publishedYear',
  'isOpenAccess',
  'license',
  'sourceUrl',
  'sourceRights',
]);

// ---------------------------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------------------------

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', copy: '©', reg: '®', trade: '™', deg: '°', micro: 'µ',
  times: '×', plusmn: '±', middot: '·', bull: '•', le: '≤', ge: '≥',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', mu: 'μ',
};

// Turns "&amp;", "&#169;", "&#xd;" and friends into the characters they stand for.
// Unknown names are left exactly as written rather than dropped.
function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (whole, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const codePoint = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return '';
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) return '';
      return String.fromCodePoint(codePoint);
    }
    const known = NAMED_ENTITIES[body.toLowerCase()];
    return known === undefined ? whole : known;
  });
}

// Only real HTML tags are removed. A looser pattern such as /<[^>]*>/ would also eat
// "p < 0.05 and n > 30" out of an abstract, which silently changes what the author wrote.
const BLOCK_TAGS = /<\/?(?:p|br|div|li|ul|ol|tr|td|th|table|h[1-6]|blockquote)(?:\s[^<>]*)?\/?>/gi;
const INLINE_TAGS = /<\/?(?:i|b|u|em|strong|sub|sup|span|font|a|small|tt|code)(?:\s[^<>]*)?\/?>/gi;

// Cleans one metadata value for display: entities decoded, HTML tags removed, line breaks and
// repeated spaces folded into single spaces (repository abstracts are usually pasted from a PDF
// and carry a hard line break every few words).
function cleanText(value) {
  if (value === undefined || value === null) return '';
  let text = String(value);
  // Repositories often store text that was already escaped once ("&amp;nbsp;"), so the XML layer
  // leaves "&nbsp;" behind. One more pass here turns that into the intended character.
  text = decodeEntities(text);
  text = text.replace(BLOCK_TAGS, ' ').replace(INLINE_TAGS, '');
  text = text.replace(/[\u0000-\u001F\u007F ​﻿]+/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function uniqueCaseInsensitive(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 1. Parsing an OAI-PMH response
// ---------------------------------------------------------------------------------------------

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // "dc:title" and "oai_dc:dc" become "title" and "dc", whatever prefix the server picked
  parseTagValue: false, // keep "0012" and "2023" as text, never as numbers
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false, // decoded by decodeEntities() below, so behaviour does not depend on parser limits
});

// Text of an element, whether the parser gave us "text" or { '#text': 'text', '@_lang': 'en' }.
function xmlText(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') {
    return node['#text'] === undefined ? '' : decodeEntities(String(node['#text'])).trim();
  }
  return decodeEntities(String(node)).trim();
}

function addField(fields, key, text) {
  if (!text) return;
  if (!fields[key]) fields[key] = [];
  fields[key].push(text);
}

// Both metadata formats are turned into the same simple shape:
//   { 'dc.title': ['...'], 'dc.contributor.advisor': ['...'], ... }
// "dim" already has schema.element.qualifier; "oai_dc" only has dc.<element>.
function readMetadata(metadataNode) {
  if (!metadataNode || typeof metadataNode !== 'object') {
    return { metadataFormat: null, fields: {} };
  }

  if (metadataNode.dim !== undefined) {
    const fields = {};
    for (const field of asArray(metadataNode.dim && metadataNode.dim.field)) {
      if (!field || typeof field !== 'object') continue;
      const schema = String(field['@_mdschema'] || 'dc').trim().toLowerCase();
      const element = String(field['@_element'] || '').trim().toLowerCase();
      const qualifier = String(field['@_qualifier'] || '').trim().toLowerCase();
      if (!element) continue;
      addField(fields, qualifier ? `${schema}.${element}.${qualifier}` : `${schema}.${element}`, xmlText(field));
    }
    return { metadataFormat: 'dim', fields };
  }

  if (metadataNode.dc !== undefined) {
    const fields = {};
    const dc = metadataNode.dc && typeof metadataNode.dc === 'object' ? metadataNode.dc : {};
    for (const [name, value] of Object.entries(dc)) {
      if (name.startsWith('@_') || name === '#text') continue;
      for (const item of asArray(value)) {
        addField(fields, `dc.${name.toLowerCase()}`, xmlText(item));
      }
    }
    return { metadataFormat: 'oai_dc', fields };
  }

  return { metadataFormat: 'unknown', fields: {} };
}

/**
 * parseOaiResponse(xmlString)
 *   -> { records, resumptionToken, completeListSize, error }
 *
 * records[i] = { identifier, datestamp, setSpecs, deleted, metadataFormat, fields }
 * resumptionToken   text to send for the next page, or null when this was the last page
 * completeListSize  total the repository says it has for this query, or null when it does not say
 * error             null, or { code, message }. Codes are the OAI ones ("noRecordsMatch",
 *                   "badResumptionToken", "cannotDisseminateFormat", ...) plus two of our own:
 *                   "malformedXml" and "notOaiPmh". "noRecordsMatch" simply means "nothing new";
 *                   the caller decides it is not a failure.
 *
 * Never throws: bad input comes back as an error object so one broken page cannot crash a run.
 */
function parseOaiResponse(xmlString) {
  const empty = { records: [], resumptionToken: null, completeListSize: null, error: null };

  if (typeof xmlString !== 'string' || !xmlString.trim()) {
    return { ...empty, error: { code: 'malformedXml', message: 'Empty response body.' } };
  }

  // The parser itself is forgiving (it accepts unclosed tags), so check first. A half-delivered
  // page must be reported, not silently read as "a short page with no resumption token".
  const validation = XMLValidator.validate(xmlString);
  if (validation !== true) {
    const detail = validation && validation.err ? `${validation.err.msg} (line ${validation.err.line})` : 'Invalid XML.';
    return { ...empty, error: { code: 'malformedXml', message: detail } };
  }

  let parsed;
  try {
    parsed = xmlParser.parse(xmlString);
  } catch (err) {
    return { ...empty, error: { code: 'malformedXml', message: err.message } };
  }

  const root = parsed && parsed['OAI-PMH'];
  if (!root || typeof root !== 'object') {
    // Typically an HTML error page from a proxy or a login wall.
    return { ...empty, error: { code: 'notOaiPmh', message: 'Response is XML but not an OAI-PMH document.' } };
  }

  let error = null;
  const errorNode = asArray(root.error)[0];
  if (errorNode !== undefined) {
    const code = typeof errorNode === 'object' ? String(errorNode['@_code'] || 'unknown') : 'unknown';
    error = { code, message: xmlText(errorNode) || code };
  }

  const container = root.ListRecords || root.GetRecord || null;
  if (!container || typeof container !== 'object') {
    return { ...empty, error };
  }

  const records = [];
  for (const recordNode of asArray(container.record)) {
    if (!recordNode || typeof recordNode !== 'object') continue;
    const header = recordNode.header && typeof recordNode.header === 'object' ? recordNode.header : {};
    const identifier = xmlText(header.identifier);
    if (!identifier) continue; // a record we cannot name can never be updated later, so it is useless to us

    const deleted = String(header['@_status'] || '').trim().toLowerCase() === 'deleted';
    const { metadataFormat, fields } = deleted
      ? { metadataFormat: null, fields: {} }
      : readMetadata(recordNode.metadata);

    records.push({
      identifier,
      datestamp: xmlText(header.datestamp) || null,
      setSpecs: asArray(header.setSpec).map(xmlText).filter(Boolean),
      deleted,
      metadataFormat,
      fields,
    });
  }

  // <resumptionToken> with text = more pages. Present but empty = this was the last page.
  let resumptionToken = null;
  let completeListSize = null;
  const tokenNode = asArray(container.resumptionToken)[0];
  if (tokenNode !== undefined) {
    resumptionToken = xmlText(tokenNode) || null;
    if (tokenNode && typeof tokenNode === 'object') {
      const size = parseInt(tokenNode['@_completeListSize'], 10);
      completeListSize = Number.isFinite(size) ? size : null;
    }
  }

  return { records, resumptionToken, completeListSize, error };
}

// ---------------------------------------------------------------------------------------------
// 2. Mapping one OAI record to a Thesis
// ---------------------------------------------------------------------------------------------

// Cleaned, non-empty values of the first listed keys that have any.
function firstValues(fields, keys) {
  for (const key of keys) {
    const values = asArray(fields[key]).map(cleanText).filter(Boolean);
    if (values.length > 0) return values;
  }
  return [];
}

// Cleaned, non-empty values of all listed keys together.
function allValues(fields, keys) {
  const out = [];
  for (const key of keys) {
    for (const value of asArray(fields[key])) {
      const cleaned = cleanText(value);
      if (cleaned) out.push(cleaned);
    }
  }
  return out;
}

// "Thesis", "Doctoral thesis", "Master's Dissertation", "info:eu-repo/semantics/masterThesis", ...
// Deliberately NOT matched: "Internship Report", "Project Report", "Article".
const THESIS_TYPE_PATTERN = /thes[ie]s|dissertation/i;

function isThesisType(typeValues) {
  return typeValues.some((value) => THESIS_TYPE_PATTERN.test(value));
}

// Repositories store names as "Family, Given". The rest of the site shows "Given Family".
// Only the unambiguous one-comma form is turned around; anything else is kept as written.
function normalisePersonName(raw) {
  const name = cleanText(raw).replace(/[\s,;]+$/, '');
  const parts = name.split(',').map((part) => part.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

// One field sometimes holds several people ("Rahman, A.; Karim, B."). A comma is NOT a separator
// here because it is part of "Family, Given".
function splitPeople(values) {
  const names = [];
  for (const value of values) {
    for (const piece of String(value).split(/\s*(?:;|\||\n)\s*/)) {
      const name = normalisePersonName(piece);
      if (name) names.push(name);
    }
  }
  return uniqueCaseInsensitive(names);
}

const ORGANISATION_START = /^(department|dept\.?|school|institute|faculty|centre|center|college|division|graduate school|program(me)?)\b/i;
const ORGANISATION_ANYWHERE = /\b(department of|school of|institute of|faculty of|centre for|center for|university|college|laboratory)\b/i;

function looksLikeDepartment(value) {
  return ORGANISATION_START.test(value) || /\b(department|dept\.?) of\b/i.test(value);
}

function looksLikeOrganisation(value) {
  return ORGANISATION_START.test(value) || ORGANISATION_ANYWHERE.test(value);
}

// Standard notes DSpace cataloguers add as extra description fields. In "oai_dc" they are not
// labelled, so they must be told apart from the abstract.
const DESCRIPTION_BOILERPLATE = /^(this (thesis|dissertation|report|project|paper|internship report) (is|was|has been) (submitted|presented)|a (thesis|dissertation|project|report) (submitted|presented)|submitted in partial fulfil+ment|in partial fulfil+ment|catalogu?ed from|includes bibliograph)/i;

const MIN_LABELLED_ABSTRACT_CHARS = 20; // labelled as abstract by the repository: accept unless it is a stub like "N/A"
const MIN_GUESSED_ABSTRACT_CHARS = 150; // unlabelled: must be clearly a paragraph, not a note or a name
const MIN_GUESSED_ABSTRACT_WORDS = 20;

function pickAbstract(record) {
  const { fields } = record;

  if (record.metadataFormat === 'dim') {
    const labelled = firstValues(fields, ['dc.description.abstract', 'dcterms.abstract']);
    const longest = labelled.sort((a, b) => b.length - a.length)[0] || '';
    return longest.length >= MIN_LABELLED_ABSTRACT_CHARS ? longest : '';
  }

  const candidates = allValues(fields, ['dc.description'])
    .filter((text) => !DESCRIPTION_BOILERPLATE.test(text))
    .sort((a, b) => b.length - a.length);
  const best = candidates[0] || '';
  const wordCount = best ? best.split(' ').length : 0;
  return best.length >= MIN_GUESSED_ABSTRACT_CHARS && wordCount >= MIN_GUESSED_ABSTRACT_WORDS ? best : '';
}

function extractYear(text, currentYear) {
  const match = String(text || '').match(/(?<!\d)(1[89]\d{2}|20\d{2})(?!\d)/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return year >= 1900 && year <= currentYear + 1 ? year : null;
}

function firstYear(values, currentYear) {
  for (const value of values) {
    const year = extractYear(value, currentYear);
    if (year) return year;
  }
  return null;
}

// A DSpace record carries several dates. Only one of them is the year of the thesis:
//   issued       when the thesis was published  <- the one we want
//   copyright    "©2023", almost always the same year
//   accessioned / available   when a librarian uploaded it, often years later
// So: issued first, then copyright/submitted/created, and the upload date only as a last resort
// (earliest one, because the thesis cannot be newer than its upload).
function chooseYear(record, currentYear = new Date().getFullYear()) {
  const { fields } = record;

  if (record.metadataFormat === 'dim') {
    for (const key of ['dc.date.issued', 'dcterms.issued', 'dc.date.copyright', 'dc.date.submitted', 'dc.date.created', 'dc.date']) {
      const year = firstYear(asArray(fields[key]), currentYear);
      if (year) return year;
    }
    const uploadYears = allValues(fields, ['dc.date.accessioned', 'dc.date.available'])
      .map((value) => extractYear(value, currentYear))
      .filter(Boolean);
    return uploadYears.length > 0 ? Math.min(...uploadYears) : null;
  }

  // oai_dc: the dates are not labelled. DSpace writes the upload dates as full timestamps
  // ("2024-05-14T04:06:06Z") and the issue date as a plain date ("2023-11"), so the shape tells them apart.
  const dates = allValues(fields, ['dc.date']);
  const timestamps = dates.filter((value) => /^\d{4}-\d{2}-\d{2}T/.test(value));
  const others = dates.filter((value) => !/^\d{4}-\d{2}-\d{2}T/.test(value));
  const plainDates = others.filter((value) => /^\d{4}(-\d{2}){0,2}$/.test(value));

  const fromPlain = firstYear(plainDates, currentYear);
  if (fromPlain) return fromPlain;
  const fromOther = firstYear(others, currentYear);
  if (fromOther) return fromOther;
  const uploadYears = timestamps.map((value) => extractYear(value, currentYear)).filter(Boolean);
  return uploadYears.length > 0 ? Math.min(...uploadYears) : null;
}

// Degree level is only taken from wording that names a degree. Bare two-letter forms such as
// "MA" or "BS" are ignored unless written with dots, because they also appear as ordinary words.
const PHD_PATTERN = /\b(ph\.?\s?d|d\.?\s?phil|doctor of philosophy)\b/i;
const DOCTORAL_PATTERN = /\b(doctor of|doctoral|doctorate)\b/i;
const MPHIL_PATTERN = /\b(m\.?\s?phil|master of philosophy)\b/i;
const MASTER_SCIENCE_PATTERN = /\b(m\.?\s?sc|master(?:['’]?s)? of science)\b|\bm\.\s?s\.(?=[\s,)]|$)/i;
const MASTER_PATTERN = /\b(master(?:['’]?s)?|masters|m\.?\s?eng|m\.?\s?tech|mba|mph|ll\.?m)\b|\bm\.\s?a\.(?=[\s,)]|$)/i;
const BACHELOR_SCIENCE_PATTERN = /\b(b\.?\s?sc|bachelor(?:['’]?s)? of science)\b|\bb\.\s?s\.(?=[\s,)]|$)/i;
const BACHELOR_PATTERN = /\b(bachelor(?:['’]?s)?|bachelors|b\.?\s?eng|b\.?\s?tech|b\.?\s?pharm|b\.?\s?arch|bba|ll\.?b|undergraduate|honou?rs)\b|\bb\.\s?a\.(?=[\s,)]|$)/i;

function degreeFromText(text) {
  if (!text) return null;
  if (PHD_PATTERN.test(text)) return { level: 'doctoral', degreeType: 'Ph.D. Dissertation' };
  if (DOCTORAL_PATTERN.test(text)) return { level: 'doctoral', degreeType: 'Doctoral Dissertation' };
  if (MPHIL_PATTERN.test(text)) return { level: 'masters', degreeType: 'M.Phil. Thesis' };
  if (MASTER_SCIENCE_PATTERN.test(text)) return { level: 'masters', degreeType: 'M.Sc. Thesis' };
  if (MASTER_PATTERN.test(text)) return { level: 'masters', degreeType: "Master's Thesis" };
  if (BACHELOR_SCIENCE_PATTERN.test(text)) return { level: 'bachelor', degreeType: 'B.Sc. Thesis' };
  if (BACHELOR_PATTERN.test(text)) return { level: 'bachelor', degreeType: "Bachelor's Thesis" };
  return null;
}

// Looks for a stated degree, most specific source first. Returns null when nothing states one.
function detectDegree(record, typeValues) {
  const { fields } = record;

  // 1. Fields whose whole purpose is to name the degree ("Bachelor of Science in Biotechnology").
  const degreeKeys = Object.keys(fields).filter((key) => /(^|\.)degree(\.|$)/.test(key));
  const nameKeys = degreeKeys.filter((key) => !key.endsWith('.level'));
  const levelKeys = degreeKeys.filter((key) => key.endsWith('.level'));
  for (const key of [...nameKeys, ...levelKeys]) {
    for (const value of asArray(fields[key])) {
      const found = degreeFromText(cleanText(value));
      if (found) return found;
    }
  }

  // 2. The type itself ("Doctoral thesis", "masterThesis").
  for (const value of typeValues) {
    const found = degreeFromText(value.replace(/([a-z])([A-Z])/g, '$1 $2'));
    if (found) return found;
  }

  // 3. A note such as "...in partial fulfillment of the requirements for the degree of Master of
  //    Arts in English". Only the words right after "degree of" are read, never a whole abstract,
  //    so a thesis ABOUT doctoral education is not mistaken for a doctoral thesis.
  for (const text of allValues(fields, ['dc.description', 'dc.description.note', 'dc.description.statementofresponsibility'])) {
    const match = text.match(/\bdegree of\s+(.{3,90})/i);
    if (match) {
      const found = degreeFromText(match[1]);
      if (found) return found;
    }
  }

  return null;
}

// Catalogue keywords that are also everyday words in other fields ("market segmentation",
// "consensus building", "accessibility of health care"). They are not trusted on their own.
const AMBIGUOUS_SUBJECT_KEYWORDS = new Set(['segmentation', 'consensus', 'accessibility', 'usability', 'sensors']);

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SUBJECT_MATCHERS = SUBJECT_CATALOG
  .filter((subject) => subject.id !== 'other')
  .map((subject) => ({
    subject,
    patterns: subject.keywords
      .filter((keyword) => !AMBIGUOUS_SUBJECT_KEYWORDS.has(keyword))
      // whole words only: "nlp" must not match inside another word
      .map((keyword) => new RegExp(`(^|[^a-z0-9])${escapeRegex(keyword)}($|[^a-z0-9])`, 'i')),
  }));

// Maps the repository's own subject keywords to one of the site's disciplines, but only when the
// evidence points one way: one discipline must match more keywords than every other. A tie, or no
// match, returns null and the record gets the neutral category. A wrong discipline is worse than
// none, because the discipline filter would then show the thesis to the wrong readers.
function matchDiscipline(subjectTerms) {
  const terms = uniqueCaseInsensitive(subjectTerms.map((term) => term.toLowerCase()));
  if (terms.length === 0) return null;

  const scored = SUBJECT_MATCHERS
    .map(({ subject, patterns }) => ({
      subject,
      hits: terms.filter((term) => patterns.some((pattern) => pattern.test(term))).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].hits === scored[1].hits) return null;
  return scored[0].subject;
}

// The handle ("http://hdl.handle.net/10361/22810") is the permanent address of the record in its
// own repository. It keeps working when the repository changes software, which a page URL does not.
function pickSourceUrl(record) {
  const candidates = allValues(record.fields, ['dc.identifier.uri', 'dc.identifier'])
    .filter((value) => /^https?:\/\/\S+$/i.test(value));

  const handle = candidates.find((value) => /^https?:\/\/hdl\.handle\.net\/\S+/i.test(value));
  if (handle) return handle.replace(/^http:\/\//i, 'https://');

  const repositoryHandlePage = candidates.find((value) => /\/handle\/\d[\d.]*\/\S+/.test(value));
  if (repositoryHandlePage) return repositoryHandlePage;

  // DSpace builds its OAI identifier as "oai:<host>:<handle>", so the handle can be read from it
  // when the record lists no URL at all.
  const fromIdentifier = String(record.identifier || '').match(/^oai:[^:\s]+:(\d[\d.]*\/[^\s/]+)$/);
  if (fromIdentifier) return `https://hdl.handle.net/${fromIdentifier[1]}`;

  return null;
}

function detectOpenAccess(fields) {
  const statements = allValues(fields, ['datacite.rights', 'others.access-status', 'dc.rights.accessrights', 'dcterms.accessrights']);
  if (statements.some((text) => /\b(restricted|embargo(ed)?|closed)\b/i.test(text))) return false;
  if (statements.some((text) => /open[\s._-]*access/i.test(text))) return true;
  return null; // not stated: leave the model default, do not claim either way
}

function skip(reason) {
  return { thesis: null, skipReason: reason };
}

/**
 * mapRecordToThesis(oaiRecord, repository, options?)
 *   -> { thesis, skipReason }
 *
 * Exactly one of the two is set:
 *   thesis      plain object with every field the Thesis model needs for a harvested record
 *   skipReason  one of SKIP_REASONS when the record must not be stored
 *
 * Pure function: no network, no database. `options.currentYear` exists only so tests can pin
 * the "year cannot be in the future" check.
 */
function mapRecordToThesis(oaiRecord, repository, options = {}) {
  if (!oaiRecord || typeof oaiRecord !== 'object') return skip(SKIP_REASONS.NO_METADATA);
  if (!repository || !repository.key || !repository.name) {
    throw new Error('mapRecordToThesis needs a repository with at least { key, name }.');
  }
  if (oaiRecord.deleted) return skip(SKIP_REASONS.DELETED_AT_SOURCE);
  if (oaiRecord.metadataFormat !== 'dim' && oaiRecord.metadataFormat !== 'oai_dc') {
    return skip(oaiRecord.metadataFormat ? SKIP_REASONS.UNSUPPORTED_METADATA : SKIP_REASONS.NO_METADATA);
  }

  const fields = oaiRecord.fields || {};
  const isDim = oaiRecord.metadataFormat === 'dim';

  // Is it a thesis at all? Repositories also hold articles, reports, newsletters and drawings.
  const typeValues = allValues(fields, ['dc.type', 'dcterms.type']);
  if (!repository.treatAllAsThesis && !isThesisType(typeValues)) return skip(SKIP_REASONS.NOT_THESIS);

  const title = firstValues(fields, ['dc.title'])[0] || '';
  if (title.length < 3) return skip(SKIP_REASONS.NO_TITLE);

  // In dim the author is "dc.contributor.author"; in oai_dc DSpace publishes the same people as dc:creator.
  const authorNames = splitPeople(isDim
    ? firstValues(fields, ['dc.contributor.author', 'dc.creator'])
    : firstValues(fields, ['dc.creator']));
  if (authorNames.length === 0) return skip(SKIP_REASONS.NO_AUTHOR);

  // Thesis.abstract is required and the site searches and summarises it. We do not write a
  // placeholder abstract: a thesis without one is skipped and shows up in the summary count.
  const abstract = pickAbstract(oaiRecord);
  if (!abstract) return skip(SKIP_REASONS.NO_ABSTRACT);

  const sourceUrl = pickSourceUrl(oaiRecord);
  if (!sourceUrl) return skip(SKIP_REASONS.NO_SOURCE_LINK); // every copied record must lead back to its original

  // Advisor and department. dim labels them. In oai_dc both arrive as plain dc:contributor, so a
  // contributor that reads like "Department of ..." is the department and a person-like one is the advisor.
  let advisorNames;
  let department;
  if (isDim) {
    advisorNames = splitPeople(allValues(fields, ['dc.contributor.advisor', 'dc.contributor.supervisor']));
    department = firstValues(fields, ['dc.contributor.department', 'thesis.degree.department', 'thesis.degree.discipline'])[0] || '';
  } else {
    const contributors = allValues(fields, ['dc.contributor']);
    department = contributors.find(looksLikeDepartment) || '';
    advisorNames = splitPeople(contributors.filter((value) => !looksLikeOrganisation(value)));
  }

  const degree = detectDegree(oaiRecord, typeValues);
  const saysDissertation = typeValues.some((value) => /dissertation/i.test(value));
  const publicationType = (degree && degree.level === 'doctoral') || (!degree && saysDissertation) ? 'dissertation' : 'thesis';

  const discipline = matchDiscipline(allValues(fields, Object.keys(fields).filter((key) => key === 'dc.subject' || key.startsWith('dc.subject.'))));

  const rights = uniqueCaseInsensitive(allValues(fields, ['dc.rights']));
  const licenceUrl = allValues(fields, ['dc.rights.uri', 'dc.rights', 'dcterms.license'])
    .map((value) => (value.match(/https?:\/\/creativecommons\.org\/\S+/i) || [])[0])
    .find(Boolean);

  const sourceUpdatedAt = oaiRecord.datestamp ? new Date(oaiRecord.datestamp) : null;

  const thesis = {
    title,
    abstract,
    category: discipline ? discipline.label : NEUTRAL_CATEGORY,
    subjects: discipline
      ? [{ id: discipline.id, label: discipline.label, shortLabel: discipline.shortLabel, provenance: 'provider_mapped', sourceId: null }]
      : [],
    degreeType: degree ? degree.degreeType : NEUTRAL_DEGREE_TYPE,
    publicationType,
    university: repository.name,
    countryCode: repository.countryCode || null,
    department: department || UNKNOWN_DEPARTMENT,
    author: authorNames.join(', '),
    authors: authorNames.map((name) => ({ name, affiliation: repository.name })),
    advisor: advisorNames.length > 0 ? advisorNames.join(', ') : null,
    publisher: firstValues(fields, ['dc.publisher'])[0] || repository.name,
    publishedYear: chooseYear(oaiRecord, options.currentYear),
    isOpenAccess: detectOpenAccess(fields),
    license: licenceUrl || '',

    // Harvest bookkeeping (see models/Thesis.js).
    origin: 'harvest',
    // Searchable straight away: the local search only returns status "approved", and the record
    // was already reviewed and published by its own university library.
    status: 'approved',
    sourceRepository: repository.key,
    sourceRepositoryName: repository.repositoryName || repository.name,
    sourceUrl,
    sourceRights: rights.join(' ').slice(0, 1000),
    externalId: oaiRecord.identifier,
    sourceUpdatedAt: sourceUpdatedAt && !Number.isNaN(sourceUpdatedAt.getTime()) ? sourceUpdatedAt : null,
  };

  return { thesis, skipReason: null };
}

// ---------------------------------------------------------------------------------------------
// 3. Saving: insert, update, or leave alone
// ---------------------------------------------------------------------------------------------

function fingerprintValue(field, value) {
  if (value === undefined || value === null) return '';
  if (field === 'authors') return asArray(value).map((author) => String((author && author.name) || '').trim());
  if (field === 'subjects') return asArray(value).map((subject) => String((subject && subject.id) || '').trim());
  if (typeof value === 'string') return value.trim();
  return String(value);
}

/**
 * computeHarvestChecksum(doc) -> string
 * Fingerprint of the harvester-owned fields of a mapped object OR of a stored Thesis document.
 * Works on both because it only reads plain values (author names, subject ids), never Mongo ids.
 */
function computeHarvestChecksum(doc) {
  const snapshot = HARVESTED_CONTENT_FIELDS.map((field) => [field, fingerprintValue(field, doc ? doc[field] : undefined)]);
  return crypto.createHash('sha1').update(JSON.stringify(snapshot)).digest('hex');
}

async function findByExternalId(ThesisModel, externalId) {
  const query = ThesisModel.findOne({ externalId });
  // Real Mongoose: ask for a plain object. Test doubles may return the document directly.
  return query && typeof query.lean === 'function' ? query.lean() : query;
}

function pickContentFields(mapped) {
  const out = {};
  for (const field of HARVESTED_CONTENT_FIELDS) {
    if (mapped[field] !== undefined) out[field] = mapped[field];
  }
  return out;
}

// True when the record is hidden because the SOURCE withdrew it (markHarvestedDeleted below),
// as opposed to an admin rejecting it. Admin rejections always carry rejectedBy.
function isHiddenBySourceDeletion(doc) {
  return doc.status === 'rejected' && Boolean(doc.sourceDeletedAt) && !doc.rejectedBy;
}

/**
 * upsertHarvested(ThesisModel, mapped, { dryRun, now }?)
 *   -> { action: 'inserted' | 'updated' | 'unchanged' | 'skipped', reason? }
 *
 * THE DO-NOT-OVERWRITE RULE (checked in this order for a record that already exists here):
 *   1. origin is not "harvest"   -> skipped "not-harvest-origin". A thesis deposited on this site
 *                                   is never touched, whatever the harvester finds.
 *   2. status is "rejected" by an admin -> skipped "admin-rejected". It stays rejected and is
 *                                   never re-created, because the rejected record itself remains
 *                                   as the marker.
 *   3. the harvester-owned fields no longer match the fingerprint stored at the last harvest
 *      write (harvestChecksum)   -> skipped "admin-edited". Somebody corrected the record by
 *                                   hand; their version wins for good.
 *   4. fingerprint of the new data equals the stored one -> "unchanged", nothing is written.
 *   5. otherwise                 -> "updated": only the harvester-owned fields are written.
 *                                   status, pin, upvotes, catalogId, approval fields are never
 *                                   written by an update.
 * One exception to 2: a record the harvester itself hid because the source reported it deleted
 * comes back (status "approved") when the source lists it again.
 *
 * With dryRun the same decision is returned but nothing is written.
 */
async function upsertHarvested(ThesisModel, mapped, { dryRun = false, now = new Date() } = {}) {
  if (!mapped || !mapped.externalId) {
    throw new Error('upsertHarvested needs a mapped thesis with an externalId.');
  }
  if (mapped.origin !== 'harvest') {
    throw new Error('upsertHarvested only accepts objects produced by mapRecordToThesis (origin "harvest").');
  }

  const newChecksum = computeHarvestChecksum(mapped);
  const existing = await findByExternalId(ThesisModel, mapped.externalId);

  if (!existing) {
    if (!dryRun) {
      await ThesisModel.create({
        ...mapped,
        harvestChecksum: newChecksum,
        harvestedAt: now,
        approvedAt: mapped.status === 'approved' ? now : null,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { action: 'inserted' };
  }

  if (existing.origin !== 'harvest') {
    return { action: 'skipped', reason: SKIP_REASONS.NOT_HARVEST_ORIGIN };
  }

  const hiddenBySource = isHiddenBySourceDeletion(existing);
  if (existing.status === 'rejected' && !hiddenBySource) {
    return { action: 'skipped', reason: SKIP_REASONS.ADMIN_REJECTED };
  }

  if (computeHarvestChecksum(existing) !== existing.harvestChecksum) {
    return { action: 'skipped', reason: SKIP_REASONS.ADMIN_EDITED };
  }

  if (!hiddenBySource && existing.harvestChecksum === newChecksum) {
    return { action: 'unchanged' };
  }

  if (!dryRun) {
    const changes = {
      ...pickContentFields(mapped),
      sourceRepository: mapped.sourceRepository,
      sourceRepositoryName: mapped.sourceRepositoryName,
      sourceUpdatedAt: mapped.sourceUpdatedAt,
      harvestChecksum: newChecksum,
      harvestedAt: now,
      updatedAt: now,
    };
    if (hiddenBySource) {
      Object.assign(changes, { status: 'approved', approvedAt: now, rejectionReason: '', rejectedAt: null, sourceDeletedAt: null });
    }
    // origin is repeated in the filter so that this statement can never modify a deposited thesis,
    // even if the document changed between the read above and this write.
    await ThesisModel.updateOne({ _id: existing._id, origin: 'harvest' }, { $set: changes });
  }
  return { action: 'updated' };
}

/**
 * markHarvestedDeleted(ThesisModel, externalId, { dryRun, now }?)
 *   -> { action: 'deleted' | 'unchanged' | 'skipped', reason? }
 *
 * Called when the source repository reports a record as deleted (withdrawn, embargoed, removed).
 * We must stop showing it, but we do not destroy the row: bookmarks and reports may point at it.
 * It is hidden by setting status "rejected" with a fixed reason and sourceDeletedAt, which also
 * lets it come back automatically if the source restores it (see upsertHarvested).
 */
async function markHarvestedDeleted(ThesisModel, externalId, { dryRun = false, now = new Date() } = {}) {
  const existing = await findByExternalId(ThesisModel, externalId);
  if (!existing) return { action: 'skipped', reason: SKIP_REASONS.DELETED_AT_SOURCE }; // we never had it
  if (existing.origin !== 'harvest') return { action: 'skipped', reason: SKIP_REASONS.NOT_HARVEST_ORIGIN };
  if (existing.status === 'rejected') {
    return isHiddenBySourceDeletion(existing)
      ? { action: 'unchanged' }
      : { action: 'skipped', reason: SKIP_REASONS.ADMIN_REJECTED };
  }

  if (!dryRun) {
    await ThesisModel.updateOne(
      { _id: existing._id, origin: 'harvest' },
      { $set: { status: 'rejected', rejectionReason: SOURCE_DELETED_REASON, rejectedAt: now, sourceDeletedAt: now, updatedAt: now } }
    );
  }
  return { action: 'deleted' };
}

// ---------------------------------------------------------------------------------------------
// 4. The harvest loop
// ---------------------------------------------------------------------------------------------

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * buildUserAgent(contactEmail?, siteUrl?) -> string
 * An honest name so a repository administrator who sees us in their logs knows who we are and
 * how to reach us. Throws when no contact address is configured: an anonymous crawler is exactly
 * what repositories block, and a block would hurt every later harvest.
 */
function buildUserAgent(contactEmail = process.env.HARVEST_CONTACT_EMAIL, siteUrl = process.env.HARVEST_SITE_URL) {
  const email = String(contactEmail || '').trim();
  if (!/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/.test(email)) {
    throw new Error('HARVEST_CONTACT_EMAIL is not set (or is not an email address). Harvesting needs a real contact address to send to the repository.');
  }
  const url = String(siteUrl || '').trim();
  const about = /^https?:\/\/\S+$/i.test(url) ? `+${url}; mailto:${email}` : `mailto:${email}`;
  return `TheThesisArchiveHarvester/${HARVESTER_VERSION} (${SITE_NAME}; ${about})`;
}

// OAI-PMH accepts a day ("2024-01-01") everywhere, and a full UTC second where the repository
// supports it. Anything else is rejected here, before a request is sent.
function normaliseOaiDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const text = value instanceof Date ? value.toISOString().replace(/\.\d{3}Z$/, 'Z') : String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/.test(text) || Number.isNaN(new Date(text).getTime())) {
    throw new Error(`Invalid ${label} date "${value}". Use YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ.`);
  }
  return text;
}

/**
 * buildListRecordsUrl(baseUrl, { metadataPrefix, from, until, set, resumptionToken }) -> string
 * OAI-PMH rule: when a resumptionToken is sent it must be the ONLY argument besides the verb.
 */
function buildListRecordsUrl(baseUrl, { metadataPrefix, from, until, set, resumptionToken } = {}) {
  const params = new URLSearchParams();
  params.set('verb', 'ListRecords');
  if (resumptionToken) {
    params.set('resumptionToken', resumptionToken);
  } else {
    params.set('metadataPrefix', metadataPrefix || 'oai_dc');
    if (from) params.set('from', from);
    if (until) params.set('until', until);
    if (set) params.set('set', set);
  }
  const separator = String(baseUrl).includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${params.toString()}`;
}

// "Retry-After: 120" (seconds) or "Retry-After: Wed, 21 Oct 2026 07:28:00 GMT". Returns ms or null.
function parseRetryAfter(headerValue, nowMs = Date.now()) {
  if (headerValue === undefined || headerValue === null) return null;
  const text = String(headerValue).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return parseInt(text, 10) * 1000;
  const date = new Date(text).getTime();
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - nowMs);
}

function readHeader(response, name) {
  if (!response || !response.headers) return null;
  if (typeof response.headers.get === 'function') return response.headers.get(name);
  const wanted = name.toLowerCase();
  const key = Object.keys(response.headers).find((header) => header.toLowerCase() === wanted);
  return key ? response.headers[key] : null;
}

// One page, with timeout and retries. Returns { ok: true, body } or { ok: false, message }.
// It does not throw for network trouble: the caller turns a failure into a clean, resumable stop.
async function fetchPage(url, { fetchImpl, headers, timeoutMs, maxRetries, retryBackoffMs, sleep, onWait }) {
  let lastMessage = 'unknown error';

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let waitMs = retryBackoffMs * (2 ** attempt);
    let retryable = true;

    try {
      const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal, redirect: 'follow' });
      const status = response.status;

      if (status >= 200 && status < 300) {
        return { ok: true, body: await response.text() };
      }

      lastMessage = `HTTP ${status}`;
      if (status === 503 || status === 429) {
        // The repository is telling us it is busy. Wait exactly as long as it asks.
        const asked = parseRetryAfter(readHeader(response, 'retry-after'));
        if (asked !== null) {
          if (asked > MAX_RETRY_AFTER_MS) {
            return { ok: false, message: `${lastMessage}: the repository asked us to wait ${Math.round(asked / 1000)}s, which is longer than this run will wait. Try again later.` };
          }
          waitMs = asked;
          lastMessage = `${lastMessage} (Retry-After ${Math.round(asked / 1000)}s)`;
        }
      } else if (status < 500) {
        retryable = false; // 400, 403, 404: asking again will not help and would only add load
      }
    } catch (err) {
      lastMessage = err && err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : `network error: ${err && err.message ? err.message : err}`;
    } finally {
      clearTimeout(timer); // otherwise the pending timer would keep the process alive after the run
    }

    if (!retryable || attempt === maxRetries) break;
    if (onWait) onWait({ reason: lastMessage, waitMs, attempt: attempt + 1 });
    await sleep(waitMs);
  }

  return { ok: false, message: lastMessage };
}

function countSkip(summary, reason) {
  summary.skipped[reason] = (summary.skipped[reason] || 0) + 1;
}

function recordError(summary, message) {
  summary.errorCount += 1;
  if (summary.errors.length < MAX_STORED_ERRORS) summary.errors.push(message);
}

/**
 * harvestRepository({
 *   repository,          registry entry (services/repositoryRegistry.js)                    required
 *   from, until,         'YYYY-MM-DD' or 'YYYY-MM-DDThh:mm:ssZ'. These filter on the date the
 *                        record last CHANGED IN THE REPOSITORY, not on the year of the thesis.
 *   maxRecords,          stop after this many records were read (kept or skipped). Default: no limit.
 *   resumptionToken,     continue an earlier run from `summary.lastResumptionToken`.
 *   fetchImpl,           defaults to the global fetch; tests pass a stub.
 *   ThesisModel,         the Mongoose model (or a test double). May be omitted only with dryRun,
 *                        in which case every kept record is reported as "inserted".
 *   dryRun,              true = decide and count, write nothing.
 *   onProgress,          called after every page with { page, completeListSize, ...counts }.
 *   sleep,               async (ms) => void. Injected by tests so they do not really wait.
 *   delayMs,             pause before every request after the first. Default 1000 ms.
 *   timeoutMs, maxRetries, retryBackoffMs,   per-request limits.
 *   contactEmail, siteUrl,                   override HARVEST_CONTACT_EMAIL / HARVEST_SITE_URL.
 *   sampleLimit,         how many mapped records to return in summary.samples (default 3 in dry run, else 0).
 *   now,                 () => Date, for tests.
 * })
 *   -> {
 *     fetched, inserted, updated, unchanged, skipped: { reason: count }, deleted,
 *     errors: [message], errorCount, lastResumptionToken,
 *     complete, requests, metadataPrefix, completeListSize, dryRun, samples
 *   }
 *
 * `errors` is empty on a clean run. A network failure does not throw: it is recorded in `errors`
 * and the run stops with `lastResumptionToken` set, so it can be continued later.
 * `lastResumptionToken` is always safe to resume from: when the run stopped in the middle of a
 * page it is the token of THAT page (re-reading a page is harmless, records are matched by id),
 * and it is null when the run started and stopped inside the first page or finished everything.
 */
async function harvestRepository({
  repository,
  from,
  until,
  maxRecords,
  resumptionToken: startToken = null,
  fetchImpl = globalThis.fetch,
  ThesisModel = null,
  dryRun = false,
  onProgress = null,
  sleep = defaultSleep,
  delayMs,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  retryBackoffMs = DEFAULT_RETRY_BACKOFF_MS,
  contactEmail,
  siteUrl,
  sampleLimit,
  now = () => new Date(),
} = {}) {
  if (!repository || !repository.key || !repository.oaiBaseUrl) {
    throw new Error('harvestRepository needs a repository entry with key and oaiBaseUrl.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('harvestRepository needs a fetch implementation.');
  }
  if (!ThesisModel && !dryRun) {
    throw new Error('harvestRepository needs ThesisModel unless dryRun is true.');
  }

  const userAgent = buildUserAgent(contactEmail === undefined ? process.env.HARVEST_CONTACT_EMAIL : contactEmail, siteUrl === undefined ? process.env.HARVEST_SITE_URL : siteUrl);
  const contact = String(contactEmail === undefined ? process.env.HARVEST_CONTACT_EMAIL : contactEmail).trim();
  const headers = {
    'User-Agent': userAgent,
    From: contact, // the standard HTTP header for "who operates this robot"
    Accept: 'text/xml, application/xml;q=0.9',
  };

  const fromDate = normaliseOaiDate(from, 'from');
  const untilDate = normaliseOaiDate(until, 'until');
  if (fromDate && untilDate && fromDate.length !== untilDate.length) {
    // OAI-PMH rule: both ends of the range must use the same precision (both days, or both seconds).
    throw new Error('from and until must use the same format (both YYYY-MM-DD, or both YYYY-MM-DDThh:mm:ssZ).');
  }
  const limit = Number.isFinite(Number(maxRecords)) && Number(maxRecords) > 0 ? Math.floor(Number(maxRecords)) : Infinity;
  const pause = Number.isFinite(Number(delayMs)) && Number(delayMs) >= 0
    ? Number(delayMs)
    : (Number.isFinite(Number(repository.requestDelayMs)) ? Number(repository.requestDelayMs) : DEFAULT_DELAY_MS);
  const wantedSamples = sampleLimit === undefined ? (dryRun ? 3 : 0) : Math.max(0, Number(sampleLimit) || 0);

  let metadataPrefix = repository.metadataPrefix || 'oai_dc';
  const fallbackPrefix = repository.fallbackMetadataPrefix || 'oai_dc';
  const sets = Array.isArray(repository.sets) && repository.sets.length > 0 ? repository.sets : [null];

  const summary = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: {},
    deleted: 0,
    errors: [],
    errorCount: 0,
    lastResumptionToken: null,
    complete: false,
    requests: 0,
    metadataPrefix,
    completeListSize: null,
    dryRun: Boolean(dryRun),
    samples: [],
  };

  let page = 0;
  let stopped = false;

  for (let setIndex = 0; setIndex < sets.length && !stopped; setIndex += 1) {
    const set = sets[setIndex];
    // A resumption token belongs to one query, so it is only used for the first set of this run.
    let pageToken = setIndex === 0 ? (startToken || null) : null;
    let morePages = true;

    while (morePages && !stopped) {
      if (summary.fetched >= limit) {
        summary.lastResumptionToken = pageToken;
        stopped = true;
        break;
      }

      // Politeness: never two requests back to back. The repository is a small university
      // server, not a CDN; one request per second is the usual courtesy for OAI harvesting.
      if (summary.requests > 0) await sleep(pause);

      const url = buildListRecordsUrl(repository.oaiBaseUrl, { metadataPrefix, from: fromDate, until: untilDate, set, resumptionToken: pageToken });
      summary.requests += 1;
      const result = await fetchPage(url, {
        fetchImpl, headers, timeoutMs, maxRetries, retryBackoffMs, sleep,
        onWait: (info) => { if (onProgress) onProgress({ event: 'waiting', ...info }); },
      });

      if (!result.ok) {
        recordError(summary, `Request failed (${result.message}): ${url}`);
        summary.lastResumptionToken = pageToken;
        stopped = true;
        break;
      }

      const parsed = parseOaiResponse(result.body);

      if (parsed.error) {
        if (parsed.error.code === 'noRecordsMatch') {
          // Not a failure: nothing was added or changed in the requested period (or set).
          morePages = false;
          continue;
        }
        if (parsed.error.code === 'cannotDisseminateFormat' && !pageToken && metadataPrefix !== fallbackPrefix) {
          // The repository does not offer the richer format. Ask again in the mandatory basic one.
          metadataPrefix = fallbackPrefix;
          summary.metadataPrefix = metadataPrefix;
          continue;
        }
        const ours = parsed.error.code === 'malformedXml' || parsed.error.code === 'notOaiPmh';
        recordError(summary, ours
          ? `Unreadable response (${parsed.error.code}: ${parsed.error.message}): ${url}`
          : `Repository answered with OAI error "${parsed.error.code}": ${parsed.error.message}`);
        summary.lastResumptionToken = pageToken;
        stopped = true;
        break;
      }

      page += 1;
      if (parsed.completeListSize !== null) summary.completeListSize = parsed.completeListSize;

      let stoppedMidPage = false;
      for (const record of parsed.records) {
        if (summary.fetched >= limit) {
          stoppedMidPage = true;
          break;
        }
        summary.fetched += 1;

        try {
          if (record.deleted) {
            const outcome = ThesisModel
              ? await markHarvestedDeleted(ThesisModel, record.identifier, { dryRun, now: now() })
              : { action: 'skipped', reason: SKIP_REASONS.DELETED_AT_SOURCE };
            if (outcome.action === 'deleted') summary.deleted += 1;
            else if (outcome.action === 'unchanged') summary.unchanged += 1;
            else countSkip(summary, outcome.reason);
            continue;
          }

          const { thesis, skipReason } = mapRecordToThesis(record, repository);
          if (!thesis) {
            countSkip(summary, skipReason);
            continue;
          }
          if (summary.samples.length < wantedSamples) summary.samples.push(thesis);

          const outcome = ThesisModel
            ? await upsertHarvested(ThesisModel, thesis, { dryRun, now: now() })
            : { action: 'inserted' };
          if (outcome.action === 'skipped') countSkip(summary, outcome.reason);
          else summary[outcome.action] += 1;
        } catch (err) {
          // One bad record (for example a database validation error) must not end the whole run.
          recordError(summary, `Record ${record.identifier}: ${err && err.message ? err.message : err}`);
        }
      }

      if (onProgress) {
        onProgress({
          event: 'page',
          page,
          set,
          completeListSize: summary.completeListSize,
          fetched: summary.fetched,
          inserted: summary.inserted,
          updated: summary.updated,
          unchanged: summary.unchanged,
          deleted: summary.deleted,
          skipped: { ...summary.skipped },
          errorCount: summary.errorCount,
          resumptionToken: parsed.resumptionToken,
        });
      }

      if (stoppedMidPage) {
        summary.lastResumptionToken = pageToken; // re-read this page next time: its tail was not processed
        stopped = true;
      } else if (parsed.resumptionToken) {
        pageToken = parsed.resumptionToken;
        summary.lastResumptionToken = pageToken;
        if (summary.fetched >= limit) stopped = true;
      } else {
        morePages = false;
      }
    }
  }

  if (!stopped) {
    summary.complete = true;
    summary.lastResumptionToken = null;
  }
  return summary;
}

module.exports = {
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
  chooseYear,
  matchDiscipline,
  SKIP_REASONS,
  HARVESTED_CONTENT_FIELDS,
  NEUTRAL_CATEGORY,
  NEUTRAL_DEGREE_TYPE,
  UNKNOWN_DEPARTMENT,
  SOURCE_DELETED_REASON,
  DEFAULT_DELAY_MS,
};
