/**
 * Authoritative Academic Country & Affiliation Resolver
 * 
 * Safely resolves ISO-3166 alpha-2 country codes from:
 * - Institutional display names (e.g. "BRAC University" -> "BD", "Harvard University" -> "US")
 * - Raw affiliation strings (e.g. "Department of CSE, BRAC University, Dhaka, Bangladesh" -> "BD")
 * - Curated institution catalogs and regex patterns
 * 
 * Strict Principle:
 * - Never blindly default to BD or any country.
 * - Return uppercase 2-letter ISO code if confidently resolved, or null.
 */

const { CURATED_INSTITUTIONS } = require('./institutionService');

// Extended pattern map for multi-country resolution
const INSTITUTION_COUNTRY_PATTERNS = [
  // Bangladesh (BD)
  { pattern: /\b(bangladesh|dhaka|chittagong|khulna|rajshahi|sylhet|mymensingh)\b/i, code: 'BD' },
  { pattern: /bangladesh\s+university\s+of\s+engineering|buet/i, code: 'BD' },
  { pattern: /university\s+of\s+dhaka|\bdhaka\s+university\b|\bdu\b/i, code: 'BD' },
  { pattern: /brac\s+university|\bbracu\b/i, code: 'BD' },
  { pattern: /north\s+south\s+university|\bnsu\b/i, code: 'BD' },
  { pattern: /islamic\s+university\s+of\s+technology|\biut\b/i, code: 'BD' },
  { pattern: /shahjalal\s+university|sust/i, code: 'BD' },
  { pattern: /jahangirnagar\s+university|\bju\b/i, code: 'BD' },
  { pattern: /rajshahi\s+university|\bru\b/i, code: 'BD' },
  { pattern: /khulna\s+university|kuet/i, code: 'BD' },
  { pattern: /chittagong\s+university|cuet/i, code: 'BD' },
  { pattern: /ahsanullah\s+university|aust/i, code: 'BD' },
  { pattern: /east\s+west\s+university|\bewu\b/i, code: 'BD' },
  { pattern: /united\s+international\s+university|\buiu\b/i, code: 'BD' },
  { pattern: /american\s+international\s+university[- ]bangladesh|\baiub\b/i, code: 'BD' },
  { pattern: /daffodil\s+international\s+university|\bdiu\b/i, code: 'BD' },
  { pattern: /bangladesh\s+agricultural\s+university|\bbau\b/i, code: 'BD' },
  { pattern: /icddr,?b|international\s+centre\s+for\s+diarrhoeal\s+disease/i, code: 'BD' },

  // United States (US)
  { pattern: /\b(united\s+states|u\.s\.a\.?|usa)\b/i, code: 'US' },
  { pattern: /massachusetts\s+institute\s+of\s+technology|\bmit\b/i, code: 'US' },
  { pattern: /harvard\s+university/i, code: 'US' },
  { pattern: /stanford\s+university/i, code: 'US' },
  { pattern: /university\s+of\s+california|berkeley|\bucla\b/i, code: 'US' },
  { pattern: /carnegie\s+mellon/i, code: 'US' },
  { pattern: /columbia\s+university/i, code: 'US' },
  { pattern: /cornell\s+university/i, code: 'US' },
  { pattern: /princeton\s+university/i, code: 'US' },
  { pattern: /yale\s+university/i, code: 'US' },
  { pattern: /university\s+of\s+washington/i, code: 'US' },
  { pattern: /university\s+of\s+michigan/i, code: 'US' },
  { pattern: /university\s+of\s+texas/i, code: 'US' },
  { pattern: /georgia\s+institute\s+of\s+technology|georgia\s+tech/i, code: 'US' },

  // United Kingdom (GB)
  { pattern: /\b(united\s+kingdom|u\.k\.?|\buk\b|england|scotland|wales)\b/i, code: 'GB' },
  { pattern: /university\s+of\s+oxford|\boxford\b/i, code: 'GB' },
  { pattern: /university\s+of\s+cambridge|\bcambridge\b/i, code: 'GB' },
  { pattern: /imperial\s+college\s+london/i, code: 'GB' },
  { pattern: /university\s+college\s+london|\bucl\b/i, code: 'GB' },
  { pattern: /university\s+of\s+edinburgh/i, code: 'GB' },
  { pattern: /king'?s\s+college\s+london|\bkcl\b/i, code: 'GB' },
  { pattern: /university\s+of\s+manchester/i, code: 'GB' },

  // Canada (CA)
  { pattern: /\b(canada|ontario|quebec|british\s+columbia|alberta)\b/i, code: 'CA' },
  { pattern: /university\s+of\s+toronto|\buoft\b/i, code: 'CA' },
  { pattern: /mcgill\s+university/i, code: 'CA' },
  { pattern: /university\s+of\s+british\s+columbia|\bubc\b/i, code: 'CA' },
  { pattern: /university\s+of\s+waterloo/i, code: 'CA' },

  // Australia (AU)
  { pattern: /\b(australia|sydney|melbourne|queensland|brisbane)\b/i, code: 'AU' },
  { pattern: /university\s+of\s+melbourne/i, code: 'AU' },
  { pattern: /university\s+of\s+sydney/i, code: 'AU' },
  { pattern: /australian\s+national\s+university|\banu\b/i, code: 'AU' },
  { pattern: /monash\s+university/i, code: 'AU' },
  { pattern: /unsw|university\s+of\s+new\s+south\s+wales/i, code: 'AU' },

  // Germany (DE)
  { pattern: /\b(germany|deutschland|berlin|munich|münchen|heidelberg)\b/i, code: 'DE' },
  { pattern: /technical\s+university\s+of\s+munich|\btum\b/i, code: 'DE' },
  { pattern: /lmu\s+munich|ludwig-maximilians/i, code: 'DE' },
  { pattern: /heidelberg\s+university/i, code: 'DE' },
  { pattern: /max\s+planck/i, code: 'DE' },

  // India (IN)
  { pattern: /\b(india|delhi|mumbai|bangalore|bengaluru|kolkata|chennai|hyderabad)\b/i, code: 'IN' },
  { pattern: /indian\s+institute\s+of\s+technology|\biit\b/i, code: 'IN' },
  { pattern: /indian\s+institute\s+of\s+science|\biisc\b/i, code: 'IN' },

  // Japan (JP)
  { pattern: /\b(japan|tokyo|kyoto|osaka|tohoku|nagoya)\b/i, code: 'JP' },
  { pattern: /university\s+of\s+tokyo/i, code: 'JP' },
  { pattern: /kyoto\s+university/i, code: 'JP' },
];

/**
 * Resolves an ISO-3166 alpha-2 country code from institution name or affiliation text.
 * @param {string|object} candidate - Institution name, affiliation string, or object with name/university
 * @returns {string|null} - Uppercase 2-letter ISO code or null
 */
function resolveCountryCode(candidate) {
  if (!candidate) return null;

  let text = '';
  if (typeof candidate === 'string') {
    text = candidate.trim();
  } else if (typeof candidate === 'object') {
    text = [
      candidate.countryCode,
      candidate.name,
      candidate.university,
      candidate.rawAffiliation,
      candidate.affiliation,
      candidate.awardingInstitution?.name,
      candidate.awardingInstitution?.countryCode,
    ]
      .filter((t) => typeof t === 'string' && t.trim())
      .join(' ');
  }

  if (!text) return null;

  // Direct ISO 2-letter check
  if (/^[A-Z]{2}$/.test(text)) {
    return text.toUpperCase();
  }

  // 1. Check curated institutions list first
  const lowerText = text.toLowerCase();
  for (const cur of CURATED_INSTITUTIONS) {
    if (cur.countryCode && cur.name && lowerText.includes(cur.name.toLowerCase())) {
      return cur.countryCode.toUpperCase();
    }
    if (cur.countryCode && Array.isArray(cur.aliases)) {
      for (const alias of cur.aliases) {
        if (lowerText.includes(alias.toLowerCase())) {
          return cur.countryCode.toUpperCase();
        }
      }
    }
  }

  // 2. Check pattern map
  for (const item of INSTITUTION_COUNTRY_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.code.toUpperCase();
    }
  }

  return null;
}

module.exports = {
  resolveCountryCode,
  INSTITUTION_COUNTRY_PATTERNS,
};
