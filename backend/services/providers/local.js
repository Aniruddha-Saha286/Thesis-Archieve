const mongoose = require('mongoose');
const Thesis = require('../../models/Thesis');
const { createNormalizedRecord } = require('../scholarlyRecord');
const { getSubjectById, mapToCanonicalSubject } = require('../subjectCatalog');
const { CURATED_INSTITUTIONS } = require('../institutionService');

async function searchLocal({ query = '', page = 1, limit = 20, offset: explicitOffset = null, filters = {}, sort = 'relevance' }) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { records: [], rawCount: 0, totalCount: 0, hasMore: false };
    }

    const andClauses = [{ status: 'approved' }];

    if (query && query.trim()) {
      const regex = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      andClauses.push({
        $or: [
          { title: regex },
          { abstract: regex },
          { author: regex },
          { university: regex },
          { department: regex },
          { publisher: regex },
          { catalogId: regex },
        ],
      });
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
                      countryCode: doc.countryCode || 'BD',
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
          countryCode: doc.countryCode || 'BD',
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
        isPeerReviewed: doc.publicationType === 'journal-article' || doc.publicationType === 'conference-paper',
        publishedYear: doc.publishedYear,
        venue: doc.university ? `${doc.university} • ${doc.department}` : doc.publisher,
        publisher: doc.publisher || doc.university || 'The Thesis Archive',
        isOpenAccess: doc.isOpenAccess !== false,
        license: doc.license || null,
        pdfUrl: isDirectPdf ? directPdf : null,
        isDirectPdf: isDirectPdf,
        fullTextUrl: directPdf,
        fullTextLocations: fullTextLocations,
        isRetracted: doc.isRetracted || false,
        datasetUrl: doc.datasetUrl || null,
        codeUrl: doc.codeUrl || null,
        catalogId: doc.catalogId,
        upvotes: doc.upvotes || 0,
        isPinned: doc.isPinned || false,
        isSample: doc.isSample || false,
        source: doc.source || 'Local Archive',
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

module.exports = { searchLocal };
