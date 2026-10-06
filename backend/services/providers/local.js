const mongoose = require('mongoose');
const Thesis = require('../../models/Thesis');
const { createNormalizedRecord } = require('../scholarlyRecord');
const { SUBJECT_CATALOG, getSubjectById, mapToCanonicalSubject } = require('../subjectCatalog');
const { CURATED_INSTITUTIONS } = require('../institutionService');

const TEXT_SEARCH_FIELDS = ['title', 'abstract', 'author', 'university', 'department', 'publisher', 'catalogId'];
const QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'using', 'based', 'via', 'that', 'this', 'are', 'was', 'its', 'our', 'use', 'used',
]);

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function combinations(items, size) {
  if (size <= 0) return [[]];
  if (size > items.length) return [];
  const out = [];
  const walk = (start, picked) => {
    if (picked.length === size) {
      out.push(picked.slice());
      return;
    }
    for (let i = start; i <= items.length - (size - picked.length); i += 1) {
      picked.push(items[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}

// Builds the text part of the Mongo filter.
// Before: the whole query had to appear as one exact phrase, so "bangla sentiment transformers"
// missed a thesis titled "Sentiment analysis in Bangla using transformers".
// Now: the exact phrase still matches, and so does a record that contains most of the
// meaningful words in any order (all of 2, 2 of 3, 3 of 4, 3 of 5, 4 of 6).
// Single-word queries behave exactly as before. Ranking is done later by the search manager.
function buildTextSearchClause(query) {
  const phrase = String(query || '').trim();
  if (!phrase) return null;

  const anyField = (regex) => ({ $or: TEXT_SEARCH_FIELDS.map((field) => ({ [field]: regex })) });
  const phraseClause = anyField(new RegExp(escapeRegex(phrase), 'i'));

  const words = [
    ...new Set(
      phrase
        .toLowerCase()
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter((w) => w.length >= 3 && !QUERY_STOPWORDS.has(w))
    ),
  ].slice(0, 6);

  if (words.length < 2) return phraseClause;

  const need = words.length <= 2 ? words.length : words.length <= 4 ? words.length - 1 : words.length - 2;
  const wordClauses = words.map((w) => anyField(new RegExp(escapeRegex(w), 'i')));
  const groups = combinations(wordClauses, need).map((group) => (group.length === 1 ? group[0] : { $and: group }));

  return { $or: [phraseClause, ...groups] };
}

async function searchLocal({ query = '', page = 1, limit = 20, offset: explicitOffset = null, filters = {}, sort = 'relevance' }) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { records: [], rawCount: 0, totalCount: 0, hasMore: false };
    }

    const andClauses = [{ status: 'approved' }];

    const textClause = buildTextSearchClause(query);
    if (textClause) {
      andClauses.push(textClause);
    }

    // Discipline / Subject filter
    if (filters.subjectId) {
      const sub = getSubjectById(filters.subjectId);
      const subOrs = [
        { 'subjects.id': String(filters.subjectId).trim().toLowerCase() },
      ];
      if (sub) {
        subOrs.push({ category: sub.label });
        if (sub.shortLabel && sub.shortLabel !== sub.label) {
          subOrs.push({ category: new RegExp(sub.shortLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
        }
      }
      andClauses.push({ $or: subOrs });
    } else if (filters.fieldId) {
      const targetFieldId = String(filters.fieldId).trim().split('/').pop();
      const matchingSubs = SUBJECT_CATALOG.filter((s) => s.openAlexFieldId === targetFieldId);
      const fieldOrs = [
        { 'subjects.fieldId': targetFieldId },
      ];
      for (const sub of matchingSubs) {
        fieldOrs.push({ 'subjects.id': sub.id });
        fieldOrs.push({ category: sub.label });
        if (sub.shortLabel && sub.shortLabel !== sub.label) {
          fieldOrs.push({ category: new RegExp(sub.shortLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
        }
      }
      andClauses.push({ $or: fieldOrs });
    } else if (filters.category && filters.category !== 'All Disciplines') {
      andClauses.push({ category: filters.category });
    }

    // Institution filter
    if (filters.institutionId || filters.institutionName) {
      const instId = filters.institutionId ? String(filters.institutionId).trim().split('/').pop().toLowerCase() : '';
      const curated = instId ? CURATED_INSTITUTIONS.find((c) => c.id.toLowerCase() === instId) : null;
      const targetName = filters.institutionName || (curated ? curated.name : '');
      const instOrs = [];

      if (instId) {
        instOrs.push({ 'awardingInstitution.id': new RegExp(instId, 'i') });
        instOrs.push({ 'authorships.institutions.id': new RegExp(instId, 'i') });
      }

      if (targetName) {
        const nameRegex = new RegExp(targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        instOrs.push({ 'awardingInstitution.name': nameRegex });
        instOrs.push({ 'authorships.institutions.name': nameRegex });
        instOrs.push({ university: nameRegex });
      }

      if (curated && Array.isArray(curated.aliases)) {
        for (const alias of curated.aliases) {
          const aliasRegex = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`, 'i');
          instOrs.push({ university: aliasRegex });
          instOrs.push({ 'awardingInstitution.name': aliasRegex });
        }
      }

      if (instOrs.length > 0) {
        andClauses.push({ $or: instOrs });
      }
    }

    // Country codes filter
    if (filters.countryCodes) {
      let codes = [];
      if (Array.isArray(filters.countryCodes)) {
        codes = filters.countryCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
      } else if (typeof filters.countryCodes === 'string' && filters.countryCodes.trim()) {
        codes = filters.countryCodes.split(/[,|]/).map((c) => c.trim().toUpperCase()).filter(Boolean);
      }
      if (codes.length > 0) {
        andClauses.push({
          $or: [
            { 'awardingInstitution.countryCode': { $in: codes } },
            { 'authorships.institutions.countryCode': { $in: codes } },
            { countryCode: { $in: codes } },
          ],
        });
      }
    }

    // Author filter
    if (filters.authorId || filters.author) {
      const authTarget = (filters.author || filters.authorId || '').trim();
      if (authTarget) {
        const authRegex = new RegExp(authTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        andClauses.push({
          $or: [
            { author: authRegex },
            { 'authors.name': authRegex },
            { 'authorships.author.name': authRegex },
            { 'authorships.author.id': authTarget },
          ],
        });
      }
    }

    if (filters.publisher && filters.publisher.trim()) {
      andClauses.push({ publisher: new RegExp(filters.publisher.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    }

    if (filters.publicationType && filters.publicationType !== 'all') {
      if (filters.publicationType === 'thesis' || filters.publicationType === 'dissertation') {
        andClauses.push({
          $or: [
            { publicationType: 'thesis' },
            { publicationType: 'dissertation' },
            { degreeType: /thesis|dissertation/i },
          ],
        });
      } else {
        andClauses.push({ publicationType: filters.publicationType });
      }
    }

    if (filters.yearMin || filters.yearMax) {
      const yearFilter = {};
      if (filters.yearMin) yearFilter.$gte = parseInt(filters.yearMin);
      if (filters.yearMax) yearFilter.$lte = parseInt(filters.yearMax);
      andClauses.push({ publishedYear: yearFilter });
    }

    if (filters.hasPdf) {
      andClauses.push({ pdfUrl: { $nin: ['', null] } });
    }

    if (filters.isOpenAccess) {
      andClauses.push({ isOpenAccess: true });
    }

    const mongoFilter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

    const sortOption = sort === 'newest' ? { publishedYear: -1, createdAt: -1 } : { isPinned: -1, upvotes: -1 };
    const skip = typeof explicitOffset === 'number' ? explicitOffset : (page - 1) * limit;

    const [totalCount, rawTheses] = await Promise.all([
      Thesis.countDocuments(mongoFilter),
      Thesis.find(mongoFilter).sort(sortOption).skip(skip).limit(limit).lean(),
    ]);

    const hasMore = skip + rawTheses.length < totalCount;

    const records = rawTheses.map((doc) => {
      const directPdf = doc.pdfUrl && doc.pdfUrl.trim() ? doc.pdfUrl.trim() : null;
      const isDirectPdf = Boolean(directPdf && (doc.isDirectPdf || directPdf.includes('/pdf') || directPdf.endsWith('.pdf')));

      const fullTextLocations = [];
      if (directPdf) {
        fullTextLocations.push({
          type: 'pdf',
          url: directPdf,
          source: 'Institutional Depository / Direct PDF',
          isDirectPdf: isDirectPdf,
        });
      }
      // A record copied from a university repository links back to its original page
      const sourceUrl = doc.sourceUrl && String(doc.sourceUrl).trim() ? String(doc.sourceUrl).trim() : null;
      if (sourceUrl) {
        fullTextLocations.push({
          type: 'landing',
          url: sourceUrl,
          source: doc.sourceRepositoryName || 'Original repository',
          isDirectPdf: false,
        });
      }

      // Preserve rich authorships with institutions
      const authorships = (doc.authorships && doc.authorships.length > 0)
        ? doc.authorships
        : [
            {
              author: {
                id: null,
                name: doc.author,
                orcid: null,
              },
              institutions: doc.university
                ? [
                    {
                      id: null,
                      ror: null,
                      name: doc.university,
                      countryCode: doc.countryCode || null,
                      type: 'education',
                    },
                  ]
                : [],
              rawAffiliation: doc.university || null,
            },
          ];

      // Explicit or verified degree-awarding institution for theses
      let awardingInstitution = null;
      if (doc.awardingInstitution && doc.awardingInstitution.name) {
        awardingInstitution = doc.awardingInstitution;
      } else if (doc.university && (!doc.publicationType || doc.publicationType === 'thesis' || doc.publicationType === 'dissertation')) {
        awardingInstitution = {
          id: null,
          ror: null,
          name: doc.university,
          countryCode: doc.countryCode || null,
          type: 'education',
          evidence: 'local_archive_thesis_metadata',
        };
      }

      // Canonical subjects
      let canonicalSubjects = (doc.subjects && doc.subjects.length > 0) ? doc.subjects : [];
      if (canonicalSubjects.length === 0 && doc.category) {
        const mapped = mapToCanonicalSubject(doc.category);
        if (mapped && mapped.id !== 'other') {
          canonicalSubjects = [
            {
              id: mapped.id,
              label: mapped.label,
              shortLabel: mapped.shortLabel,
              provenance: 'curated',
            },
          ];
        }
      }

      const citationMetrics = (doc.citationMetrics && typeof doc.citationMetrics.count === 'number')
        ? doc.citationMetrics
        : null;

      return createNormalizedRecord({
        id: String(doc._id),
        doi: doc.doi || null,
        title: doc.title,
        author: doc.author,
        authors: doc.authors && doc.authors.length > 0 ? doc.authors : [{ name: doc.author, affiliation: doc.university || null }],
        authorships: authorships,
        awardingInstitution: awardingInstitution,
        subjects: canonicalSubjects,
        citationMetrics: citationMetrics,
        citationCount: citationMetrics ? citationMetrics.count : (typeof doc.citationCount === 'number' ? doc.citationCount : null),
        abstract: doc.abstract,
        publicationType: doc.publicationType || 'thesis',
        degreeType: doc.degreeType || null,
        advisor: doc.advisor || null,
        department: doc.department || null,
        origin: doc.origin || 'deposit',
        sourceRepositoryName: doc.sourceRepositoryName || null,
        sourceUrl: sourceUrl,
        sourceRights: doc.sourceRights || null,
        isPeerReviewed: doc.publicationType === 'journal-article' || doc.publicationType === 'conference-paper',
        publishedYear: doc.publishedYear,
        venue: doc.university ? `${doc.university} • ${doc.department}` : doc.publisher,
        publisher: doc.publisher || doc.university || 'The Thesis Archive',
        isOpenAccess: doc.isOpenAccess !== false,
        license: doc.license || null,
        pdfUrl: isDirectPdf ? directPdf : null,
        isDirectPdf: isDirectPdf,
        fullTextUrl: directPdf || sourceUrl,
        fullTextLocations: fullTextLocations,
        isRetracted: doc.isRetracted || false,
        datasetUrl: doc.datasetUrl || null,
        codeUrl: doc.codeUrl || null,
        catalogId: doc.catalogId,
        upvotes: doc.upvotes || 0,
        isPinned: doc.isPinned || false,
        isSample: doc.isSample || false,
        source: doc.origin === 'harvest' && doc.sourceRepositoryName ? doc.sourceRepositoryName : (doc.source || 'Local Archive'),
      });
    });

    return {
      records,
      rawCount: rawTheses.length,
      totalCount,
      hasMore,
      nextOffset: skip + rawTheses.length,
      nextPage: hasMore ? page + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('Local provider error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchLocal, buildTextSearchClause };
