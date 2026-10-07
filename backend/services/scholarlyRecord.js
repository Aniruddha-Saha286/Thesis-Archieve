
const { mapToCanonicalSubject } = require('./subjectCatalog');
const { resolveCountryCode } = require('./countryResolver');

function normalizeTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return 'Untitled Scholarly Publication';
  return rawTitle
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDoi(rawDoi) {
  if (!rawDoi || typeof rawDoi !== 'string') return null;
  const match = rawDoi.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
  return match ? match[0].toLowerCase() : null;
}

function createNormalizedRecord(data) {
  const normDoi = normalizeDoi(data.doi);
  const cleanTitle = normalizeTitle(data.title);

  let authors = [];
  if (Array.isArray(data.authors)) {
    authors = data.authors.map((a) => {
      if (typeof a === 'string') return { name: a.trim(), affiliation: null };
      return {
        name: (a.name || `${a.given || ''} ${a.family || ''}`).trim() || 'Unknown Author',
        affiliation: a.affiliation ? String(a.affiliation).trim() : null,
      };
    }).filter((a) => a.name && a.name !== 'Unknown Author');
  } else if (typeof data.author === 'string' && data.author.trim()) {
    authors = data.author.split(/,| and /i).map((n) => ({ name: n.trim(), affiliation: null })).filter((a) => a.name);
  }

  let authorDisplay = 'Unknown Author';
  if (authors.length > 0) {
    if (authors.length <= 3) {
      authorDisplay = authors.map((a) => a.name).join(', ');
    } else {
      authorDisplay = `${authors.slice(0, 3).map((a) => a.name).join(', ')} et al.`;
    }
  }

  let publishedYear = null;
  if (data.publishedYear && !isNaN(parseInt(data.publishedYear))) {
    publishedYear = parseInt(data.publishedYear);
  } else if (data.publicationDate) {
    const yr = new Date(data.publicationDate).getFullYear();
    if (!isNaN(yr)) publishedYear = yr;
  }

  let publicationType = data.publicationType || 'unknown';
  if (['thesis', 'dissertation'].includes(publicationType)) {
  } else if (data.degreeType && /\b(thesis|dissertation|ph\.?d|master'?s thesis|doctoral)\b/i.test(data.degreeType)) {
    publicationType = 'thesis';
  } else if (publicationType === 'preprint' || data.source === 'arXiv') {
    publicationType = data.hasJournalRef ? 'journal-article' : 'preprint';
  } else if (publicationType === 'journal-article' || publicationType === 'article') {
    publicationType = 'journal-article';
  } else if (publicationType === 'proceedings-article' || publicationType === 'conference-paper') {
    publicationType = 'conference-paper';
  } else if (publicationType === 'book') {
    publicationType = 'book';
  }

  const fullTextLocations = Array.isArray(data.fullTextLocations) ? [...data.fullTextLocations] : [];

  if (data.pdfUrl && typeof data.pdfUrl === 'string' && data.pdfUrl.trim()) {
    const directUrl = data.pdfUrl.trim();
    if (!fullTextLocations.some((loc) => loc.url === directUrl)) {
      fullTextLocations.unshift({
        type: 'pdf',
        url: directUrl,
        source: data.source || 'Direct Provider',
        isDirectPdf: Boolean(data.isDirectPdf ?? true),
      });
    }
  }

  const directPdfLocation = fullTextLocations.find((loc) => loc.isDirectPdf && loc.type === 'pdf');
  const directPdfUrl = directPdfLocation ? directPdfLocation.url : (data.isDirectPdf && data.pdfUrl ? data.pdfUrl : null);

  const fullTextPageLocation = fullTextLocations.find((loc) => loc.type === 'html' || loc.type === 'landing');
  const fullTextUrl = fullTextPageLocation ? fullTextPageLocation.url : (data.fullTextUrl || null);

  const primaryId = data.id || (data._id ? String(data._id) : (normDoi ? `doi_${normDoi.replace(/[^a-z0-9]/g, '_')}` : `${data.source || 'rec'}_${Math.random().toString(36).substring(7)}`));
  const mongoId = data._id ? String(data._id) : primaryId;

  const degreeType = data.degreeType ? String(data.degreeType).trim() : null;

  let authorships = [];
  if (Array.isArray(data.authorships) && data.authorships.length > 0) {
    authorships = data.authorships.map((auth) => ({
      author: {
        id: auth.author?.id ? String(auth.author.id) : null,
        name: (auth.author?.name || auth.author?.display_name || '').trim(),
        orcid: auth.author?.orcid ? String(auth.author.orcid) : null,
      },
      institutions: Array.isArray(auth.institutions)
        ? auth.institutions.map((inst) => ({
            id: inst.id ? String(inst.id) : null,
            ror: inst.ror ? String(inst.ror) : null,
            name: (inst.name || inst.display_name || '').trim(),
            countryCode: (inst.countryCode || inst.country_code || resolveCountryCode(inst.name) || resolveCountryCode(auth.rawAffiliation) || '').trim().toUpperCase() || null,
            type: inst.type ? String(inst.type).toLowerCase() : null,
          })).filter((inst) => inst.name || inst.id)
        : [],
      rawAffiliation: auth.rawAffiliation || auth.raw_affiliation_string || null,
    })).filter((a) => a.author.name);
  } else if (authors.length > 0) {
    authorships = authors.map((a) => ({
      author: {
        id: null,
        name: a.name,
        orcid: null,
      },
      institutions: a.affiliation ? [{
        id: null,
        ror: null,
        name: a.affiliation,
        countryCode: resolveCountryCode(a.affiliation) || null,
        type: null,
      }] : [],
      rawAffiliation: a.affiliation || null,
    }));
  }

  let awardingInstitution = null;
  if (data.awardingInstitution && (data.awardingInstitution.name || data.awardingInstitution.id)) {
    awardingInstitution = {
      id: data.awardingInstitution.id ? String(data.awardingInstitution.id) : null,
      ror: data.awardingInstitution.ror ? String(data.awardingInstitution.ror) : null,
      name: (data.awardingInstitution.name || data.awardingInstitution.display_name || '').trim(),
      countryCode: (data.awardingInstitution.countryCode || data.awardingInstitution.country_code || resolveCountryCode(data.awardingInstitution.name) || '').trim().toUpperCase() || null,
      type: data.awardingInstitution.type ? String(data.awardingInstitution.type).toLowerCase() : 'education',
      evidence: data.awardingInstitution.evidence || 'thesis_metadata',
    };
  } else if (publicationType === 'thesis' && data.university) {
    awardingInstitution = {
      id: null,
      ror: null,
      name: String(data.university).trim(),
      countryCode: resolveCountryCode(data.university) || null,
      type: 'education',
      evidence: 'thesis_university_field',
    };
  }

  let subjects = [];
  if (Array.isArray(data.subjects) && data.subjects.length > 0) {
    subjects = data.subjects.map((s) => ({
      id: s.id || 'other',
      label: s.label || 'Other Disciplines',
      shortLabel: s.shortLabel || s.label || 'Other',
      provenance: s.provenance || 'curated',
      sourceId: s.sourceId || null,
      fieldId: s.fieldId || data.fieldId || null,
      subfieldId: s.subfieldId || data.subfieldId || null,
      topicId: s.topicId || data.topicId || null,
    }));
  } else if (data.category && data.category !== 'Other Disciplines') {
    const matched = mapToCanonicalSubject(data.category);
    if (matched && matched.id !== 'other') {
      subjects.push({
        id: matched.id,
        label: matched.label,
        shortLabel: matched.shortLabel,
        provenance: 'curated',
        sourceId: null,
      });
    }
  }

  if (subjects.length === 0 || subjects.every((s) => s.id === 'other')) {
    const titleMatch = data.title ? mapToCanonicalSubject(data.title) : null;
    if (titleMatch && titleMatch.id !== 'other') {
      subjects = [{
        id: titleMatch.id,
        label: titleMatch.label,
        shortLabel: titleMatch.shortLabel,
        provenance: 'inferred_title',
        sourceId: null,
      }];
    } else if (data.abstract) {
      const abstractMatch = mapToCanonicalSubject(data.abstract.slice(0, 1000));
      if (abstractMatch && abstractMatch.id !== 'other') {
        subjects = [{
          id: abstractMatch.id,
          label: abstractMatch.label,
          shortLabel: abstractMatch.shortLabel,
          provenance: 'inferred_abstract',
          sourceId: null,
        }];
      }
    }
  }

  let citationMetrics = null;
  const cCount = typeof data.citationCount === 'number'
    ? data.citationCount
    : (data.citationMetrics && typeof data.citationMetrics.count === 'number' ? data.citationMetrics.count : null);

  if (cCount !== null) {
    citationMetrics = {
      source: data.citationMetrics?.source || data.citationSource || 'OpenAlex',
      count: cCount,
      retrievedAt: data.citationMetrics?.retrievedAt || data.citationRetrievalDate || new Date().toISOString().split('T')[0],
      sourceId: data.citationMetrics?.sourceId || data.catalogId || null,
    };
  }

  const primaryUniversity = data.university || awardingInstitution?.name || (authorships[0]?.institutions[0]?.name) || null;
  const primaryCategory = data.category || (subjects[0]?.label) || 'Other Disciplines';

  return {
    id: primaryId,
    _id: mongoId,
    doi: normDoi,
    title: cleanTitle,
    authors: authors,
    authorDisplay: authorDisplay,
    authorships: authorships,
    awardingInstitution: awardingInstitution,
    subjects: subjects,
    fieldId: data.fieldId || subjects[0]?.fieldId || null,
    subfieldId: data.subfieldId || subjects[0]?.subfieldId || null,
    topicId: data.topicId || subjects[0]?.topicId || null,
    citationMetrics: citationMetrics,
    university: primaryUniversity,
    category: primaryCategory,
    abstract: data.abstract ? String(data.abstract).replace(/<[^>]*>/g, '').trim() : null,
    publicationType: publicationType,
    degreeType: degreeType,
    advisor: data.advisor ? String(data.advisor).trim() : null,
    department: data.department ? String(data.department).trim() : null,
    origin: data.origin === 'harvest' ? 'harvest' : (data.origin || null),
    sourceRepositoryName: data.sourceRepositoryName ? String(data.sourceRepositoryName).trim() : null,
    sourceUrl: data.sourceUrl ? String(data.sourceUrl).trim() : null,
    sourceRights: data.sourceRights ? String(data.sourceRights).trim() : null,
    isPeerReviewed: typeof data.isPeerReviewed === 'boolean' ? data.isPeerReviewed : Boolean(data.hasJournalRef),
    publicationDate: data.publicationDate || (publishedYear ? `${publishedYear}-01-01` : null),
    publishedYear: publishedYear,
    venue: data.venue ? String(data.venue).trim() : null,
    publisher: data.publisher ? String(data.publisher).trim() : null,
    isOpenAccess: typeof data.isOpenAccess === 'boolean' ? data.isOpenAccess : Boolean(directPdfUrl || data.openAccess),
    license: data.license ? String(data.license).trim() : null,
    pdfUrl: directPdfUrl,
    isDirectPdf: Boolean(directPdfUrl),
    fullTextUrl: fullTextUrl,
    doiUrl: normDoi ? `https://doi.org/${normDoi}` : null,
    fullTextLocations: fullTextLocations,
    isRetracted: Boolean(data.isRetracted),
    retractionNoticeUrl: data.retractionNoticeUrl || null,
    citationCount: cCount,
    citationSource: citationMetrics ? citationMetrics.source : null,
    citationRetrievalDate: citationMetrics ? citationMetrics.retrievedAt : null,
    datasetUrl: data.datasetUrl ? String(data.datasetUrl).trim() : null,
    codeUrl: data.codeUrl ? String(data.codeUrl).trim() : null,
    catalogId: data.catalogId || (normDoi ? `DOI:${normDoi}` : null),
    sources: Array.isArray(data.sources) ? data.sources : [{
      provider: data.source || 'Academic Depository',
      id: data.catalogId || data.id || '',
      url: directPdfUrl || fullTextUrl || (normDoi ? `https://doi.org/${normDoi}` : ''),
    }],
    upvotes: typeof data.upvotes === 'number' ? data.upvotes : 0,
    isPinned: Boolean(data.isPinned),
    isSample: Boolean(data.isSample),
    retrievedAt: data.retrievedAt || new Date().toISOString(),
  };
}

module.exports = {
  createNormalizedRecord,
  normalizeTitle,
  normalizeDoi,
};
