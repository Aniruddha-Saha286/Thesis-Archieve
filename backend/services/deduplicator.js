
function cleanTitleForMatching(title) {
  if (!title) return '';
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFirstAuthorSurname(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return '';
  const first = authors[0];
  const name = typeof first === 'string' ? first : (first.name || '');
  const parts = name.trim().split(/\s+/);
  return parts.length > 0 ? parts[parts.length - 1].toLowerCase().replace(/[^\w]/g, '') : '';
}

function areRecordsDuplicate(a, b) {
  if (a.doi && b.doi) {
    return a.doi.toLowerCase() === b.doi.toLowerCase();
  }

  const aArxiv = (a.catalogId || '').match(/arXiv:([0-9.]+|[a-z-]+(?:\.[a-z]+)?\/\d+)/i);
  const bArxiv = (b.catalogId || '').match(/arXiv:([0-9.]+|[a-z-]+(?:\.[a-z]+)?\/\d+)/i);
  if (aArxiv && bArxiv && aArxiv[1].toLowerCase() === bArxiv[1].toLowerCase()) {
    return true;
  }

  const titleA = cleanTitleForMatching(a.title);
  const titleB = cleanTitleForMatching(b.title);

  if (titleA.length >= 15 && titleA === titleB) {
    if (a.publishedYear && b.publishedYear) {
      if (Math.abs(a.publishedYear - b.publishedYear) > 1) {
        return false;
      }
    }

    const surnameA = getFirstAuthorSurname(a.authors);
    const surnameB = getFirstAuthorSurname(b.authors);
    if (surnameA && surnameB && surnameA !== surnameB) {
      return false;
    }

    return true;
  }

  return false;
}

function mergeTwoRecords(existing, incoming) {
  const merged = { ...existing };

  const seenSources = new Set(existing.sources.map((s) => `${s.provider}:${s.id || s.url}`));
  for (const s of incoming.sources || []) {
    const key = `${s.provider}:${s.id || s.url}`;
    if (!seenSources.has(key)) {
      seenSources.add(key);
      merged.sources.push(s);
    }
  }

  const seenUrls = new Set(existing.fullTextLocations.map((l) => l.url));
  for (const l of incoming.fullTextLocations || []) {
    if (!seenUrls.has(l.url)) {
      seenUrls.add(l.url);
      merged.fullTextLocations.push(l);
    }
  }

  if (!merged.pdfUrl && incoming.pdfUrl) {
    merged.pdfUrl = incoming.pdfUrl;
  }

  if (!merged.fullTextUrl && incoming.fullTextUrl) {
    merged.fullTextUrl = incoming.fullTextUrl;
  }

  if (!merged.doi && incoming.doi) {
    merged.doi = incoming.doi;
    merged.doiUrl = incoming.doiUrl;
  }

  if ((!merged.abstract || merged.abstract.length < 50) && incoming.abstract && incoming.abstract.length > 50) {
    merged.abstract = incoming.abstract;
  }

  if ((!merged.authors || merged.authors.length < (incoming.authors || []).length) && incoming.authors && incoming.authors.length > 0) {
    merged.authors = incoming.authors;
    merged.authorDisplay = incoming.authorDisplay;
  }

  if (merged.publicationType === 'unknown' && incoming.publicationType !== 'unknown') {
    merged.publicationType = incoming.publicationType;
  } else if (incoming.publicationType === 'thesis' || incoming.publicationType === 'dissertation') {
    merged.publicationType = incoming.publicationType;
  }

  if (incoming.isRetracted) {
    merged.isRetracted = true;
    merged.retractionNoticeUrl = incoming.retractionNoticeUrl || merged.retractionNoticeUrl;
  }

  if (typeof incoming.citationCount === 'number') {
    if (typeof merged.citationCount !== 'number' || incoming.citationCount > merged.citationCount) {
      merged.citationCount = incoming.citationCount;
      merged.citationSource = incoming.citationSource;
      merged.citationRetrievalDate = incoming.citationRetrievalDate;
    }
  }

  if (!merged.datasetUrl && incoming.datasetUrl) {
    merged.datasetUrl = incoming.datasetUrl;
  }
  if (Array.isArray(incoming.datasets) && incoming.datasets.length > 0) {
    const existingDatasets = Array.isArray(merged.datasets) ? [...merged.datasets] : [];
    const seenDatasetKeys = new Set(existingDatasets.map((d) => d.id || d.doi || d.landingUrl));
    for (const d of incoming.datasets) {
      const key = d.id || d.doi || d.landingUrl;
      if (key && !seenDatasetKeys.has(key)) {
        seenDatasetKeys.add(key);
        existingDatasets.push(d);
      }
    }
    merged.datasets = existingDatasets;
  }

  if (!merged.codeUrl && incoming.codeUrl) {
    merged.codeUrl = incoming.codeUrl;
  }

  if (!merged.degreeType && incoming.degreeType) {
    merged.degreeType = incoming.degreeType;
  }

  if (incoming.isDirectPdf && !merged.isDirectPdf) {
    merged.isDirectPdf = true;
    if (incoming.pdfUrl) merged.pdfUrl = incoming.pdfUrl;
  }

  if (incoming.isOpenAccess) {
    merged.isOpenAccess = true;
  }

  if (!merged.venue && incoming.venue) merged.venue = incoming.venue;
  if (!merged.publisher && incoming.publisher) merged.publisher = incoming.publisher;
  if (!merged.license && incoming.license) merged.license = incoming.license;

  const existingHasInstitutions = (merged.authorships || []).some((a) => a.institutions && a.institutions.length > 0);
  const incomingHasInstitutions = (incoming.authorships || []).some((a) => a.institutions && a.institutions.length > 0);
  if (!existingHasInstitutions && incomingHasInstitutions) {
    merged.authorships = incoming.authorships;
  } else if ((!merged.authorships || merged.authorships.length === 0) && incoming.authorships && incoming.authorships.length > 0) {
    merged.authorships = incoming.authorships;
  }

  if (!merged.awardingInstitution && incoming.awardingInstitution) {
    merged.awardingInstitution = incoming.awardingInstitution;
  }

  if (Array.isArray(incoming.subjects) && incoming.subjects.length > 0) {
    const existingSubjects = Array.isArray(merged.subjects) ? [...merged.subjects] : [];
    const seenSubjectIds = new Set(existingSubjects.map((s) => s.id));
    for (const s of incoming.subjects) {
      if (s.id && !seenSubjectIds.has(s.id)) {
        seenSubjectIds.add(s.id);
        existingSubjects.push(s);
      }
    }
    merged.subjects = existingSubjects;
  }

  if (incoming.citationMetrics && typeof incoming.citationMetrics.count === 'number') {
    if (!merged.citationMetrics || incoming.citationMetrics.count > (merged.citationMetrics.count || 0)) {
      merged.citationMetrics = incoming.citationMetrics;
      merged.citationCount = incoming.citationMetrics.count;
      merged.citationSource = incoming.citationMetrics.source;
      merged.citationRetrievalDate = incoming.citationMetrics.retrievedAt;
    }
  }

  if (!merged.university && incoming.university) {
    merged.university = incoming.university;
  }

  return merged;
}

function deduplicateRecords(records) {
  const result = [];

  for (const record of records) {
    let matchedIndex = -1;

    for (let i = 0; i < result.length; i++) {
      if (areRecordsDuplicate(result[i], record)) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex >= 0) {
      result[matchedIndex] = mergeTwoRecords(result[matchedIndex], record);
    } else {
      result.push({ ...record });
    }
  }

  return result;
}

module.exports = {
  areRecordsDuplicate,
  mergeTwoRecords,
  deduplicateRecords,
  cleanTitleForMatching,
  getFirstAuthorSurname,
};
