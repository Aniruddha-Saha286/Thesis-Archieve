const mongoose = require('mongoose');
const Thesis = require('../../models/Thesis');
const { createNormalizedRecord } = require('../scholarlyRecord');

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

    if (filters.category && filters.category !== 'All Disciplines') {
      andClauses.push({ category: filters.category });
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

      return createNormalizedRecord({
        id: String(doc._id),
        doi: doc.doi || null,
        title: doc.title,
        author: doc.author,
        authors: doc.authors && doc.authors.length > 0 ? doc.authors : [{ name: doc.author, affiliation: doc.university || null }],
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
