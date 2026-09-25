/**
 * Institutional Discovery and Suggestion Service
 * Queries OpenAlex Institutions API with in-memory caching and offline resilience.
 * Does NOT bill search quota.
 */

const institutionCache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

// Curated fallbacks for offline testing & rapid resolution
const CURATED_INSTITUTIONS = [
  {
    id: 'I136199984',
    openAlexId: 'https://openalex.org/I136199984',
    name: 'Harvard University',
    countryCode: 'US',
    countryName: 'United States',
    type: 'education',
    ror: 'https://ror.org/03vek6s52',
    acronyms: ['HU'],
    aliases: ['Harvard'],
    worksCount: 450000,
    citationCount: 25000000,
  },
  {
    id: 'I63966007',
    openAlexId: 'https://openalex.org/I63966007',
    name: 'Massachusetts Institute of Technology',
    countryCode: 'US',
    countryName: 'United States',
    type: 'education',
    ror: 'https://ror.org/0420pxx08',
    acronyms: ['MIT'],
    aliases: ['MIT'],
    worksCount: 280000,
    citationCount: 19000000,
  },
  {
    id: 'I40120149',
    openAlexId: 'https://openalex.org/I40120149',
    name: 'University of Oxford',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    type: 'education',
    ror: 'https://ror.org/052gg0110',
    acronyms: ['Oxon'],
    aliases: ['Oxford'],
    worksCount: 310000,
    citationCount: 18000000,
  },
  {
    id: 'I241749',
    openAlexId: 'https://openalex.org/I241749',
    name: 'University of Cambridge',
    countryCode: 'GB',
    countryName: 'United Kingdom',
    type: 'education',
    ror: 'https://ror.org/013meh722',
    acronyms: ['Cantab'],
    aliases: ['Cambridge'],
    worksCount: 320000,
    citationCount: 19500000,
  },
  {
    id: 'I97018004',
    openAlexId: 'https://openalex.org/I97018004',
    name: 'Stanford University',
    countryCode: 'US',
    countryName: 'United States',
    type: 'education',
    ror: 'https://ror.org/00f54p054',
    acronyms: ['SU'],
    aliases: ['Stanford'],
    worksCount: 320000,
    citationCount: 21000000,
  },
  {
    id: 'I157121650',
    openAlexId: 'https://openalex.org/I157121650',
    name: 'Bangladesh University of Engineering and Technology',
    countryCode: 'BD',
    countryName: 'Bangladesh',
    type: 'education',
    ror: 'https://ror.org/01k81g120',
    acronyms: ['BUET'],
    aliases: ['BUET'],
    worksCount: 12500,
    citationCount: 180000,
  },
  {
    id: 'I167389808',
    openAlexId: 'https://openalex.org/I167389808',
    name: 'University of Dhaka',
    countryCode: 'BD',
    countryName: 'Bangladesh',
    type: 'education',
    ror: 'https://ror.org/02v3cst19',
    acronyms: ['DU'],
    aliases: ['Dhaka University'],
    worksCount: 15000,
    citationCount: 190000,
  },
].map((inst) => ({
  ...inst,
  source: 'curated_offline',
  isOfflineFallback: true,
}));

async function suggestInstitutions(queryOrOptions = '', maybeOptions = {}) {
  let query = '';
  let academicOnly = true;
  let limit = 10;

  if (typeof queryOrOptions === 'string') {
    query = queryOrOptions;
    if (typeof maybeOptions === 'boolean') {
      academicOnly = maybeOptions;
    } else if (typeof maybeOptions === 'number') {
      limit = maybeOptions;
    } else if (maybeOptions && typeof maybeOptions === 'object') {
      if (maybeOptions.academicOnly !== undefined) academicOnly = maybeOptions.academicOnly;
      if (maybeOptions.limit !== undefined) limit = maybeOptions.limit;
    }
  } else if (queryOrOptions && typeof queryOrOptions === 'object') {
    query = queryOrOptions.query || queryOrOptions.q || '';
    if (queryOrOptions.academicOnly !== undefined) academicOnly = queryOrOptions.academicOnly;
    if (queryOrOptions.limit !== undefined) limit = queryOrOptions.limit;
  }

  const q = (query || '').trim();
  if (!q) {
    return CURATED_INSTITUTIONS.slice(0, limit);
  }

  const cacheKey = `${q.toLowerCase()}:${Boolean(academicOnly)}:${limit}`;
  const cached = institutionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const params = new URLSearchParams();
    params.append('search', q);
    params.append('per-page', String(Math.min(limit * 2, 25)));

    if (academicOnly) {
      params.append('filter', 'type:education');
    }

    const url = `https://api.openalex.org/institutions?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'ThesisArchive/1.0 (https://projectpanther.org; mailto:panther.thesis.vault@gmail.com)',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []).map((item) => ({
        id: item.id ? item.id.split('/').pop() : '',
        openAlexId: item.id || '',
        name: item.display_name || 'Academic Institution',
        countryCode: (item.country_code || '').toUpperCase() || null,
        countryName: item.geo?.country || null,
        type: item.type || 'education',
        ror: item.ror || null,
        acronyms: Array.isArray(item.display_name_acronyms) ? item.display_name_acronyms : [],
        aliases: Array.isArray(item.display_name_alternatives) ? item.display_name_alternatives.slice(0, 5) : [],
        worksCount: item.works_count || 0,
        citationCount: item.cited_by_count || 0,
        homepageUrl: item.homepage_url || null,
      }));

      const finalResults = results.slice(0, limit);
      institutionCache.set(cacheKey, { data: finalResults, timestamp: Date.now() });
      return finalResults;
    }
  } catch (err) {
    // Network or rate limit fallback
    console.warn('OpenAlex institution suggest fallback:', err.message);
  }

  // Fallback to local matching against curated set
  const lowerQ = q.toLowerCase();
  const matched = CURATED_INSTITUTIONS.filter((inst) => {
    if (academicOnly && inst.type !== 'education') return false;
    return (
      inst.name.toLowerCase().includes(lowerQ) ||
      (inst.countryCode && inst.countryCode.toLowerCase() === lowerQ) ||
      inst.acronyms.some((a) => a.toLowerCase().includes(lowerQ)) ||
      inst.aliases.some((al) => al.toLowerCase().includes(lowerQ))
    );
  });

  return matched.slice(0, limit);
}

module.exports = {
  suggestInstitutions,
  CURATED_INSTITUTIONS,
};
