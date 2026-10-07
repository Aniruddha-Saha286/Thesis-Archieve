
const { searchOpenAlex } = require('./providers/openalex');

const authorCache = new Map();
const authorProfileCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

const CURATED_AUTHORS = [
  {
    id: 'A5023888391',
    openAlexId: 'https://openalex.org/A5023888391',
    name: 'Yoshua Bengio',
    nameAlternatives: ['Y. Bengio'],
    orcid: 'https://orcid.org/0000-0002-1323-2880',
    worksCount: 890,
    citationCount: 780000,
    hIndex: 195,
    i10Index: 560,
    lastKnownInstitution: {
      id: 'I185261750',
      name: 'Université de Montréal',
      countryCode: 'CA',
      type: 'education',
      ror: 'https://ror.org/0161xgx34',
    },
    topics: ['Artificial Intelligence', 'Deep Learning', 'Neural Networks', 'Representation Learning'],
    isCuratedFallback: true,
    isOfflineFallback: true,
    liveMetrics: false,
    citationMetrics: {
      source: 'OpenAlex',
      retrievedAt: '2026-09-24T00:00:00.000Z',
      isOfflineFallback: true,
    },
  },
  {
    id: 'A5003442464',
    openAlexId: 'https://openalex.org/A5003442464',
    name: 'Geoffrey E. Hinton',
    nameAlternatives: ['Geoffrey Hinton', 'G. E. Hinton'],
    orcid: 'https://orcid.org/0000-0001-7649-0410',
    worksCount: 420,
    citationCount: 650000,
    hIndex: 180,
    i10Index: 320,
    lastKnownInstitution: {
      id: 'I185261750',
      name: 'University of Toronto',
      countryCode: 'CA',
      type: 'education',
      ror: 'https://ror.org/03dbr7087',
    },
    topics: ['Machine Learning', 'Artificial Neural Networks', 'Computer Vision'],
    isCuratedFallback: true,
    isOfflineFallback: true,
    liveMetrics: false,
    citationMetrics: {
      source: 'OpenAlex',
      retrievedAt: '2026-09-24T00:00:00.000Z',
      isOfflineFallback: true,
    },
  },
  {
    id: 'A5074211155',
    openAlexId: 'https://openalex.org/A5074211155',
    name: 'Yann LeCun',
    nameAlternatives: ['Y. LeCun', 'Yann André LeCun'],
    orcid: 'https://orcid.org/0000-0002-1994-6481',
    worksCount: 380,
    citationCount: 420000,
    hIndex: 155,
    i10Index: 280,
    lastKnownInstitution: {
      id: 'I57206974',
      name: 'New York University',
      countryCode: 'US',
      type: 'education',
      ror: 'https://ror.org/0190ak572',
    },
    topics: ['Convolutional Neural Networks', 'Computer Vision', 'Deep Learning'],
    isCuratedFallback: true,
    isOfflineFallback: true,
    liveMetrics: false,
    citationMetrics: {
      source: 'OpenAlex',
      retrievedAt: '2026-09-24T00:00:00.000Z',
      isOfflineFallback: true,
    },
  },
];

async function searchAuthors(queryOrOptions = '', maybeOptions = {}) {
  let query = '';
  let limit = 10;

  if (typeof queryOrOptions === 'string') {
    query = queryOrOptions;
    if (typeof maybeOptions === 'number') limit = maybeOptions;
    else if (maybeOptions && typeof maybeOptions === 'object') limit = maybeOptions.limit || 10;
  } else if (queryOrOptions && typeof queryOrOptions === 'object') {
    query = queryOrOptions.query || queryOrOptions.q || '';
    limit = queryOrOptions.limit || 10;
  }

  const q = (query || '').trim();
  if (!q) {
    return CURATED_AUTHORS.slice(0, limit);
  }

  if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test') {
    const lowerQ = q.toLowerCase();
    const matched = CURATED_AUTHORS.filter((a) =>
      a.name.toLowerCase().includes(lowerQ) ||
      a.nameAlternatives.some((alt) => alt.toLowerCase().includes(lowerQ))
    );
    return matched.slice(0, limit);
  }

  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = authorCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    params.append('search', q);
    params.append('per-page', String(Math.min(limit * 2, 25)));

    const url = `https://api.openalex.org/authors?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (https://projectpanther.org; mailto:panther.thesis.vault@gmail.com)',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []).map((item) => {
        const lastInst = item.last_known_institutions?.[0] || item.last_known_institution || null;
        const topics = (item.topics || []).slice(0, 4).map((t) => t.display_name || t.name).filter(Boolean);

        return {
          id: item.id ? item.id.split('/').pop() : '',
          openAlexId: item.id || '',
          name: item.display_name || 'Academic Researcher',
          nameAlternatives: Array.isArray(item.display_name_alternatives) ? item.display_name_alternatives.slice(0, 5) : [],
          orcid: item.orcid || null,
          worksCount: item.works_count || 0,
          citationCount: item.cited_by_count || 0,
          hIndex: item.summary_stats?.h_index ?? null,
          i10Index: item.summary_stats?.i10_index ?? null,
          lastKnownInstitution: lastInst ? {
            id: lastInst.id ? lastInst.id.split('/').pop() : null,
            name: lastInst.display_name || '',
            countryCode: (lastInst.country_code || '').toUpperCase() || null,
            type: lastInst.type || 'education',
            ror: lastInst.ror || null,
          } : null,
          topics,
          citationMetrics: {
            source: 'OpenAlex',
            retrievedAt: new Date().toISOString(),
          },
        };
      });

      const finalResults = results.slice(0, limit);
      authorCache.set(cacheKey, { data: finalResults, timestamp: Date.now() });
      return finalResults;
    }
  } catch (err) {
    console.warn('OpenAlex author search fallback:', err.message);
  }

  const lowerQ = q.toLowerCase();
  const matched = CURATED_AUTHORS.filter((a) =>
    a.name.toLowerCase().includes(lowerQ) ||
    a.nameAlternatives.some((alt) => alt.toLowerCase().includes(lowerQ)) ||
    (a.lastKnownInstitution && a.lastKnownInstitution.name.toLowerCase().includes(lowerQ))
  );

  return matched.slice(0, limit);
}

async function getAuthorProfile(authorId) {
  if (!authorId) return null;
  const cleanId = String(authorId).trim().split('/').pop();

  const cached = authorProfileCache.get(cleanId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test') {
    const found = CURATED_AUTHORS.find((a) => a.id === cleanId || a.openAlexId?.includes(cleanId)) || CURATED_AUTHORS[0];
    const offlineProfile = {
      author: { ...found, affiliationsHistory: [] },
      works: [
        {
          id: 'w_offline_1',
          title: 'Deep Learning and Representation Learning',
          publishedYear: 2024,
          citationCount: 5000,
        },
      ],
      retrievedAt: new Date().toISOString(),
    };
    return offlineProfile;
  }

  let authorDetails = null;

  try {
    const url = `https://api.openalex.org/authors/${cleanId}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (https://projectpanther.org; mailto:panther.thesis.vault@gmail.com)',
      },
    });

    if (res.ok) {
      const item = await res.json();
      const lastInst = item.last_known_institutions?.[0] || item.last_known_institution || null;
      const topics = (item.topics || []).map((t) => t.display_name || t.name).filter(Boolean);

      authorDetails = {
        id: cleanId,
        openAlexId: item.id || `https://openalex.org/${cleanId}`,
        name: item.display_name || 'Academic Researcher',
        nameAlternatives: item.display_name_alternatives || [],
        orcid: item.orcid || null,
        worksCount: item.works_count || 0,
        citationCount: item.cited_by_count || 0,
        hIndex: item.summary_stats?.h_index ?? null,
        i10Index: item.summary_stats?.i10_index ?? null,
        lastKnownInstitution: lastInst ? {
          id: lastInst.id ? lastInst.id.split('/').pop() : null,
          name: lastInst.display_name || '',
          countryCode: (lastInst.country_code || '').toUpperCase() || null,
          type: lastInst.type || 'education',
          ror: lastInst.ror || null,
        } : null,
        affiliationsHistory: (item.affiliations || []).slice(0, 5).map((aff) => ({
          institutionName: aff.institution?.display_name || '',
          years: aff.years || [],
        })),
        topics,
      };
    }
  } catch (err) {
    console.warn('OpenAlex author profile fetch error:', err.message);
  }

  if (!authorDetails) {
    const found = CURATED_AUTHORS.find((a) => a.id === cleanId);
    if (found) {
      authorDetails = { ...found, affiliationsHistory: [] };
    } else {
      return null;
    }
  }

  let works = [];
  let worksStatus = 'fulfilled';
  let worksError = null;

  try {
    const worksResult = await searchOpenAlex({
      filters: { authorId: cleanId },
      sort: 'citations',
      limit: 15,
    });
    if (worksResult.error) {
      worksStatus = 'error';
      worksError = worksResult.error;
    } else {
      works = worksResult.records || [];
    }
  } catch (wErr) {
    console.warn('Author works fetch error:', wErr.message);
    worksStatus = 'error';
    worksError = wErr.message;
  }

  const profile = {
    author: authorDetails,
    works,
    worksStatus,
    worksError,
    totalWorks: authorDetails.worksCount || 0,
    hasMoreWorks: (authorDetails.worksCount || 0) > works.length,
    retrievedAt: new Date().toISOString(),
  };

  if (worksStatus !== 'error') {
    authorProfileCache.set(cleanId, { data: profile, timestamp: Date.now() });
  }
  return profile;
}

async function getAuthorWorks(authorId, { page = 1, limit = 20, sort = 'citations' } = {}) {
  if (!authorId) {
    return { records: [], totalCount: 0, hasMore: false, error: 'Author ID is required' };
  }
  const cleanId = String(authorId).trim().split('/').pop();

  if (process.env.OFFLINE_MODE === 'true' || process.env.NODE_ENV === 'test') {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const count = Math.min(limit || 20, 20);
    return {
      records: [
        {
          id: `w_offline_auth_${cleanId}_${pageNum}`,
          title: `Scholarly Publication on Deep Representations - Volume ${pageNum}`,
          publishedYear: 2024,
          citationCount: 4200,
          publicationType: 'journal-article',
          venue: 'Journal of Machine Learning Research',
          pdfUrl: 'https://example.org/pdf/auth_1.pdf',
          isDirectPdf: true,
        },
      ],
      totalCount: 100,
      hasMore: pageNum < 5,
      nextPage: pageNum < 5 ? pageNum + 1 : null,
      error: null,
    };
  }

  try {
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    return await searchOpenAlex({
      filters: { authorId: cleanId },
      page: pageNum,
      limit: limitNum,
      sort,
    });
  } catch (err) {
    return {
      records: [],
      totalCount: 0,
      hasMore: false,
      error: err.message,
    };
  }
}

module.exports = {
  searchAuthors,
  getAuthorProfile,
  getAuthorWorks,
  CURATED_AUTHORS,
};
