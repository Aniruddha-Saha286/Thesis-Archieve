/**
 * Academic Citation Generation Service
 * Produces standards-compliant BibTeX, RIS, and APA (7th Edition) citations
 * strictly from verified metadata. Missing fields are preserved as missing or flagged,
 * NEVER silently filled with fictional values or the current year.
 */

// Formats an author's name into "Surname, First Initial."
function formatAuthorApa(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const surname = parts[parts.length - 1];
  const initials = parts.slice(0, -1).map((p) => `${p[0].toUpperCase()}.`).join(' ');
  return `${surname}, ${initials}`;
}

// Generates an APA 7th Edition citation string and reports any missing fields
function generateApaCitation(record) {
  const missingFields = [];

  // Authors
  let authorStr = '';
  if (Array.isArray(record.authors) && record.authors.length > 0) {
    const apaAuthors = record.authors.map((a) => formatAuthorApa(typeof a === 'string' ? a : a.name));
    if (apaAuthors.length === 1) {
      authorStr = apaAuthors[0];
    } else if (apaAuthors.length === 2) {
      authorStr = `${apaAuthors[0]}, & ${apaAuthors[1]}`;
    } else if (apaAuthors.length <= 20) {
      authorStr = `${apaAuthors.slice(0, -1).join(', ')}, & ${apaAuthors[apaAuthors.length - 1]}`;
    } else {
      authorStr = `${apaAuthors.slice(0, 19).join(', ')}, ... ${apaAuthors[apaAuthors.length - 1]}`;
    }
  } else if (record.author) {
    authorStr = formatAuthorApa(record.author);
  } else {
    authorStr = record.title || 'Untitled Work';
    missingFields.push('author');
  }

  // Year: strictly from publishedYear, NEVER fictional current year
  const yearStr = record.publishedYear ? `(${record.publishedYear})` : '(n.d.)';
  if (!record.publishedYear) missingFields.push('year');

  // Title
  const titleStr = record.title || 'Untitled Work';

  // Venue / Degree / Source
  let venueStr = '';
  const isMaster = (record.degreeType || '').toLowerCase().includes('master') || (record.degreeType || '').toLowerCase().includes('m.sc') || (record.degreeType || '').toLowerCase().includes('m.phil');
  const degreeDesc = isMaster ? "Master's thesis" : "Doctoral dissertation";

  if (record.publicationType === 'thesis' || record.publicationType === 'dissertation') {
    const inst = record.venue || record.publisher || record.university || '';
    if (inst) {
      venueStr = ` [${degreeDesc}, ${inst}]`;
    } else {
      venueStr = ` [${degreeDesc}]`;
      missingFields.push('institution');
    }
  } else if (record.publicationType === 'journal-article') {
    if (record.venue) {
      venueStr = ` ${record.venue}.`;
    } else if (record.publisher) {
      venueStr = ` ${record.publisher}.`;
    } else {
      missingFields.push('journal');
    }
  } else if (record.publicationType === 'conference-paper') {
    if (record.venue) {
      venueStr = ` In ${record.venue}.`;
    } else {
      missingFields.push('proceedings');
    }
  } else if (record.publicationType === 'preprint') {
    // Distinguish preprint server accurately without assuming arXiv
    const preprintVenue = record.venue || record.publisher || record.source || 'Preprint repository';
    venueStr = ` ${preprintVenue}.`;
  } else if (record.venue) {
    venueStr = ` ${record.venue}.`;
  }

  // Identifier link
  let linkStr = '';
  if (record.doi) {
    linkStr = ` https://doi.org/${record.doi}`;
  } else if (record.pdfUrl) {
    linkStr = ` ${record.pdfUrl}`;
  } else if (record.fullTextUrl) {
    linkStr = ` ${record.fullTextUrl}`;
  }

  const apaText = `${authorStr} ${yearStr}. ${titleStr}.${venueStr}${linkStr}`.replace(/\.\.+/g, '.').trim();

  return {
    citation: apaText,
    style: 'APA 7th Edition',
    missingFields,
  };
}

// Generates a BibTeX entry
function generateBibtex(record) {
  const missingFields = [];

  // Determine citation key
  let firstSurname = 'unknown';
  if (Array.isArray(record.authors) && record.authors.length > 0) {
    const raw = typeof record.authors[0] === 'string' ? record.authors[0] : record.authors[0].name;
    const parts = (raw || '').trim().split(/\s+/);
    if (parts.length > 0) firstSurname = parts[parts.length - 1].toLowerCase().replace(/[^\w]/g, '');
  } else if (record.author) {
    const parts = record.author.trim().split(/\s+/);
    firstSurname = parts[parts.length - 1].toLowerCase().replace(/[^\w]/g, '');
  } else {
    missingFields.push('author');
  }

  const year = record.publishedYear || 'unknown';
  if (!record.publishedYear) missingFields.push('year');

  const firstWord = (record.title || 'work')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim()
    .split(/\s+/)[0] || 'work';

  const citeKey = `${firstSurname}${year}${firstWord}`;

  // Determine entry type: keep degree level separate
  const isMaster = (record.degreeType || '').toLowerCase().includes('master') || (record.degreeType || '').toLowerCase().includes('m.sc') || (record.degreeType || '').toLowerCase().includes('m.phil');

  let entryType = 'misc';
  if (record.publicationType === 'thesis' || record.publicationType === 'dissertation') {
    entryType = isMaster ? 'mastersthesis' : 'phdthesis';
  } else if (record.publicationType === 'journal-article') {
    entryType = 'article';
  } else if (record.publicationType === 'conference-paper') {
    entryType = 'inproceedings';
  } else if (record.publicationType === 'preprint') {
    entryType = 'misc';
  } else if (record.publicationType === 'book') {
    entryType = 'book';
  }

  const lines = [`@${entryType}{${citeKey},`];
  lines.push(`  title = {${record.title || ''}},`);

  if (Array.isArray(record.authors) && record.authors.length > 0) {
    const authorVal = record.authors.map((a) => (typeof a === 'string' ? a : a.name)).join(' and ');
    lines.push(`  author = {${authorVal}},`);
  } else if (record.author) {
    lines.push(`  author = {${record.author}},`);
  }

  if (record.publishedYear) {
    lines.push(`  year = {${record.publishedYear}},`);
  }

  if (entryType === 'article') {
    if (record.venue) lines.push(`  journal = {${record.venue}},`);
    else missingFields.push('journal');
  } else if (entryType === 'inproceedings') {
    if (record.venue) lines.push(`  booktitle = {${record.venue}},`);
    else missingFields.push('booktitle');
  } else if (entryType === 'phdthesis' || entryType === 'mastersthesis') {
    const school = record.university || record.venue || record.publisher;
    if (school) lines.push(`  school = {${school}},`);
    else missingFields.push('school');
  } else if (entryType === 'unpublished' || entryType === 'misc') {
    const note = record.venue || record.source || 'Preprint repository';
    lines.push(`  note = {${note}},`);
  }

  if (record.publisher && entryType !== 'phdthesis' && entryType !== 'mastersthesis') {
    lines.push(`  publisher = {${record.publisher}},`);
  }

  if (record.doi) {
    lines.push(`  doi = {${record.doi}},`);
  }

  if (record.pdfUrl) {
    lines.push(`  url = {${record.pdfUrl}},`);
  } else if (record.fullTextUrl) {
    lines.push(`  url = {${record.fullTextUrl}},`);
  }

  lines.push('}');
  const bibtex = lines.join('\n');

  return {
    citation: bibtex,
    format: 'BibTeX',
    missingFields,
  };
}

// Generates an RIS format citation
function generateRis(record) {
  let risType = 'GEN';
  if (record.publicationType === 'thesis' || record.publicationType === 'dissertation') risType = 'THES';
  else if (record.publicationType === 'journal-article') risType = 'JOUR';
  else if (record.publicationType === 'conference-paper') risType = 'CONF';
  else if (record.publicationType === 'preprint') risType = 'PREP';
  else if (record.publicationType === 'book') risType = 'BOOK';

  const lines = [`TY  - ${risType}`];
  lines.push(`TI  - ${record.title || 'Untitled Work'}`);

  if (Array.isArray(record.authors) && record.authors.length > 0) {
    for (const a of record.authors) {
      const name = typeof a === 'string' ? a : a.name;
      if (name) lines.push(`AU  - ${name}`);
    }
  } else if (record.author) {
    lines.push(`AU  - ${record.author}`);
  }

  if (record.publishedYear) {
    lines.push(`PY  - ${record.publishedYear}///`);
  }

  if (record.venue) {
    lines.push(`JO  - ${record.venue}`);
  }

  if (record.publisher || record.university) {
    lines.push(`PB  - ${record.publisher || record.university}`);
  }

  if (record.doi) {
    lines.push(`DO  - ${record.doi}`);
  }

  if (record.pdfUrl) {
    lines.push(`UR  - ${record.pdfUrl}`);
  } else if (record.fullTextUrl) {
    lines.push(`UR  - ${record.fullTextUrl}`);
  }

  if (record.abstract) {
    lines.push(`AB  - ${record.abstract}`);
  }

  lines.push('ER  - ');
  return lines.join('\n');
}

// Batch export an array of records to unified BibTeX or RIS file
function batchExportCitations(records = [], format = 'bibtex', options = {}) {
  const omissions = Array.isArray(options.omissions) ? options.omissions : [];
  const isRis = format.toLowerCase() === 'ris';

  // Strictly filter out any unresolvable placeholder records
  const validRecords = records.filter((r) => r && r.title && r.title.trim().length > 0);

  let headerComments = '';
  if (omissions.length > 0) {
    if (isRis) {
      headerComments = omissions.map((id) => `N1  - Note: Omitted unresolvable paper record (ID: ${id}) missing from saved repository library.`).join('\n') + '\n\n';
    } else {
      headerComments = `% The Thesis Archive Bibliography Export\n` +
        `% Note: ${omissions.length} saved collection item(s) were omitted because their records are no longer present in your saved library:\n` +
        omissions.map((id) => `%   - Omitted paper ID: ${id}`).join('\n') +
        `\n\n`;
    }
  }

  if (isRis) {
    const entries = validRecords.map((r) => generateRis(r)).join('\n\n');
    return headerComments + entries;
  }

  const entries = validRecords.map((r) => generateBibtex(r).citation).join('\n\n');
  return headerComments + entries;
}

module.exports = {
  generateApaCitation,
  generateBibtex,
  generateRis,
  batchExportCitations,
};
