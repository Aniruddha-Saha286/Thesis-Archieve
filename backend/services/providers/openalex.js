const { createNormalizedRecord } = require('../scholarlyRecord');
const { getSubjectById, extractSubjectsFromOpenAlex } = require('../subjectCatalog');

async function searchOpenAlex({ query = '', page = 1, limit = 20, filters = {}, sort = 'relevance' }) {
  try {
    const params = new URLSearchParams();
    if (query && query.trim()) {
      params.append('search', query.trim());
    }

    params.append('per-page', String(Math.min(limit, 50)));
    params.append('page', String(page));

    // Build OpenAlex filters
    const filterParts = [];

    if (filters.publicationType) {
      if (filters.publicationType === 'thesis' || filters.publicationType === 'dissertation') {
        filterParts.push('type:dissertation');
      } else if (filters.publicationType === 'journal-article') {
        filterParts.push('type:article');
      } else if (filters.publicationType === 'conference-paper') {
        filterParts.push('type:proceedings-article');
      } else if (filters.publicationType === 'preprint') {
        filterParts.push('type:preprint');
      }
    }

    if (filters.hasPdf) {
      filterParts.push('has_fulltext:true');
      filterParts.push('is_oa:true');
    } else if (filters.isOpenAccess) {
      filterParts.push('is_oa:true');
    }

    if (filters.yearMin) {
      filterParts.push(`from_publication_date:${filters.yearMin}-01-01`);
    }
    if (filters.yearMax) {
      filterParts.push(`to_publication_date:${filters.yearMax}-12-31`);
    }

    // Institution filter (works filter: institutions.id)
    if (filters.institutionId) {
      const instId = String(filters.institutionId).trim().split('/').pop();
      filterParts.push(`institutions.id:${instId}`);
    }

    // Country code filter (works filter: authorships.institutions.country_code)
    if (filters.countryCodes) {
      let codes = [];
      if (Array.isArray(filters.countryCodes)) {
        codes = filters.countryCodes.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
      } else if (typeof filters.countryCodes === 'string' && filters.countryCodes.trim()) {
        codes = filters.countryCodes.split(/[,|]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
      }
      if (codes.length > 0) {
        filterParts.push(`authorships.institutions.country_code:${codes.join('|')}`);
      }
    }

    // Author filter (works filter: authorships.author.id)
    if (filters.authorId) {
      const authId = String(filters.authorId).trim().split('/').pop();
      filterParts.push(`authorships.author.id:${authId}`);
    }

    // Minimum citations filter (works filter: cited_by_count:>X)
    if (filters.minCitations && !isNaN(parseInt(filters.minCitations))) {
      const minCit = Math.max(0, parseInt(filters.minCitations));
      if (minCit > 0) {
        filterParts.push(`cited_by_count:>${minCit - 1}`);
      }
    }

    // Subject / Category filter
    if (filters.subjectId) {
      const sub = getSubjectById(filters.subjectId);
      if (sub && sub.openAlexConceptIds && sub.openAlexConceptIds.length > 0) {
        filterParts.push(`concepts.id:${sub.openAlexConceptIds.join('|')}`);
      } else if (sub && sub.keywords && sub.keywords.length > 0 && !query) {
        params.append('search', sub.keywords[0]);
      }
    }

    if (filterParts.length > 0) {
      params.append('filter', filterParts.join(','));
    }

    // Sort order
    if (sort === 'citations') {
      params.append('sort', 'cited_by_count:desc');
    } else if (sort === 'newest') {
      params.append('sort', 'publication_date:desc');
    } else {
      params.append('sort', 'relevance_score:desc');
    }

    const url = `https://api.openalex.org/works?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (https://projectpanther.org; mailto:panther.thesis.vault@gmail.com)',
      },
    });

    if (res.status === 429) {
      console.warn('OpenAlex rate limit (429) encountered. Backing off.');
      return { records: [], totalCount: 0, hasMore: false, error: 'OpenAlex rate limit. Throttling.' };
    }

    if (!res.ok) {
      return { records: [], totalCount: 0, hasMore: false, error: `OpenAlex API error: ${res.status}` };
    }

    const data = await res.json();
    const items = data.results || [];
    const meta = data.meta || {};
    const totalCount = meta.count || 0;
    const hasMore = page * limit < totalCount;

    const records = items.map((w) => {
      const doi = w.doi ? w.doi.replace('https://doi.org/', '').toLowerCase() : null;

      // Extract authors with affiliations
      const authors = (w.authorships || []).map((auth) => ({
        name: auth.author?.display_name || 'Academic Author',
        affiliation: auth.institutions?.[0]?.display_name || null,
      })).filter((a) => a.name);

      // Extract rich authorships with institutions
      const authorships = (w.authorships || []).map((auth) => ({
        author: {
          id: auth.author?.id ? String(auth.author.id).split('/').pop() : null,
          name: auth.author?.display_name || 'Academic Author',
          orcid: auth.author?.orcid || null,
        },
        institutions: (auth.institutions || []).map((inst) => ({
          id: inst.id ? String(inst.id).split('/').pop() : null,
          ror: inst.ror || null,
          name: inst.display_name || '',
          countryCode: (inst.country_code || '').toUpperCase() || null,
          type: inst.type || null,
        })),
        rawAffiliation: auth.raw_affiliation_string || null,
      }));

      // Never derive degree-awarding institution from author affiliation.
      // Must remain null unless an explicit degree-granting institution field exists in source metadata.
      let awardingInstitution = null;
      if (w.awarding_institution && w.awarding_institution.display_name) {
        awardingInstitution = {
          id: w.awarding_institution.id ? String(w.awarding_institution.id).split('/').pop() : null,
          ror: w.awarding_institution.ror || null,
          name: w.awarding_institution.display_name,
          countryCode: (w.awarding_institution.country_code || '').toUpperCase() || null,
          type: w.awarding_institution.type || 'education',
          evidence: 'openalex_explicit_awarding_institution',
        };
      }

      // Extract canonical subjects
      const canonicalSubjects = extractSubjectsFromOpenAlex(w.concepts, w.topics);

      // Reconstruct abstract from inverted index if present
      let cleanAbstract = null;
      if (w.abstract_inverted_index) {
        try {
          const words = [];
          for (const [word, positions] of Object.entries(w.abstract_inverted_index)) {
            for (const pos of positions) {
              words[pos] = word;
            }
          }
          cleanAbstract = words.filter(Boolean).join(' ');
        } catch (e) {}
      }

      // Check for direct PDF URL
      const candidatePdf = w.best_oa_location?.pdf_url || w.primary_location?.pdf_url || w.open_access?.oa_url || null;
      const isDirectPdf = Boolean(
        candidatePdf && (
          /\.pdf(\?|$|#)/i.test(candidatePdf) ||
          candidatePdf.includes('/pdf/') ||
          candidatePdf.includes('downloadpdf') ||
          candidatePdf.includes('/servlets/purl/') ||
          candidatePdf.includes('file?id=')
        )
      );

      const fullTextLocations = [];
      if (candidatePdf) {
        fullTextLocations.push({
          type: isDirectPdf ? 'pdf' : 'landing',
          url: candidatePdf,
          source: 'OpenAlex OA Location',
          isDirectPdf: isDirectPdf,
        });
      }
      if (w.primary_location?.landing_page_url && w.primary_location.landing_page_url !== candidatePdf) {
        fullTextLocations.push({
          type: 'landing',
          url: w.primary_location.landing_page_url,
          source: 'Publisher Landing Page',
          isDirectPdf: false,
        });
      }

      const venueName = w.primary_location?.source?.display_name || w.host_venue?.display_name || null;

      let pubType = 'journal-article';
      if (w.type === 'dissertation') pubType = 'thesis';
      else if (w.type === 'preprint') pubType = 'preprint';
      else if (w.type === 'proceedings-article' || w.type === 'proceedings') pubType = 'conference-paper';
      else if (w.type === 'book' || w.type === 'monograph' || w.type === 'book-chapter') pubType = 'book';
      else if (w.type === 'article' || w.type === 'journal-article') pubType = 'journal-article';
      else if (w.type) pubType = w.type;

      const citationMetrics = typeof w.cited_by_count === 'number' ? {
        source: 'OpenAlex',
        count: w.cited_by_count,
        retrievedAt: new Date().toISOString().split('T')[0],
        sourceId: w.id || null,
      } : null;

      return createNormalizedRecord({
        id: `openalex_${w.id ? w.id.split('/').pop() : Math.random().toString(36).substring(7)}`,
        doi: doi,
        title: w.title,
        authors: authors,
        authorships: authorships,
        awardingInstitution: awardingInstitution,
        subjects: canonicalSubjects,
        citationMetrics: citationMetrics,
        abstract: cleanAbstract,
        publicationType: pubType,
        publicationDate: w.publication_date,
        publishedYear: w.publication_year,
        venue: venueName,
        publisher: venueName,
        isOpenAccess: Boolean(w.open_access?.is_oa),
        license: w.primary_location?.license || w.best_oa_location?.license || null,
        pdfUrl: isDirectPdf ? candidatePdf : null,
        isDirectPdf: isDirectPdf,
        fullTextUrl: w.primary_location?.landing_page_url || w.open_access?.oa_url || null,
        fullTextLocations: fullTextLocations,
        isRetracted: Boolean(w.is_retracted),
        citationCount: typeof w.cited_by_count === 'number' ? w.cited_by_count : null,
        citationSource: 'OpenAlex',
        source: 'OpenAlex',
        catalogId: w.id ? `OA:${w.id.split('/').pop()}` : null,
      });
    });

    return {
      records,
      rawCount: items.length,
      totalCount,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
      error: null,
    };
  } catch (err) {
    console.error('OpenAlex adapter error:', err.message);
    return { records: [], rawCount: 0, totalCount: 0, hasMore: false, error: err.message };
  }
}

module.exports = { searchOpenAlex };
