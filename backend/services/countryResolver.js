/**
 * Authoritative Academic Country & Affiliation Resolver
 * 
 * Safely resolves ISO-3166 alpha-2 country codes from:
 * - Institutional display names (e.g. "BRAC University" -> "BD", "Harvard University" -> "US")
 * - Raw affiliation strings (e.g. "Department of CSE, BRAC University, Dhaka, Bangladesh" -> "BD")
 * - Curated institution catalogs and regex patterns
 * 
 * Strict Principles:
 * - Never blindly default to BD or any country.
 * - Return uppercase 2-letter ISO code if confidently resolved, or null.
 * - Strictly require word boundaries for acronyms (e.g., RMIT must never resolve to MIT / US).
 * - Avoid prepositions or ambiguous short tokens (e.g. French 'du' in Université du Québec must never trigger BD).
 * - Prioritize explicit country names in text over institution substring guesses.
 */

const { CURATED_INSTITUTIONS } = require('./institutionService');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Explicit country names have highest precedence
const EXPLICIT_COUNTRY_PATTERNS = [
  { pattern: /\b(australia)\b/i, code: 'AU' },
  { pattern: /\b(canada)\b/i, code: 'CA' },
  { pattern: /\b(saudi\s+arabia)\b/i, code: 'SA' },
  { pattern: /\b(bangladesh)\b/i, code: 'BD' },
  { pattern: /\b(united\s+states|u\.s\.a\.?|usa)\b/i, code: 'US' },
  { pattern: /\b(united\s+kingdom|u\.k\.?|\buk\b|england|scotland|wales)\b/i, code: 'GB' },
  { pattern: /\b(germany|deutschland)\b/i, code: 'DE' },
  { pattern: /\b(india)\b/i, code: 'IN' },
  { pattern: /\b(japan)\b/i, code: 'JP' },
  { pattern: /\b(france)\b/i, code: 'FR' },
];

// Disambiguated institution-specific patterns
const INSTITUTION_COUNTRY_PATTERNS = [
  // Specific international disambiguations FIRST (to prevent substring clashes with common acronyms)
  { pattern: /\b(rmit\s+university|\brmit\b|royal\s+melbourne\s+institute\s+of\s+technology)\b/i, code: 'AU' },
  { pattern: /\b(kaust|king\s+abdullah\s+university\s+of\s+science\s+and\s+technology)\b/i, code: 'SA' },
  { pattern: /\b(universit[eé]\s+du\s+qu[eé]bec)\b/i, code: 'CA' },

  // Bangladesh (BD) - strictly anchored, no bare 'du', 'ju', 'ru', or unanchored 'aust'
  { pattern: /\b(bangladesh|dhaka|chittagong|khulna|rajshahi|sylhet|mymensingh)\b/i, code: 'BD' },
  { pattern: /\b(bangladesh\s+university\s+of\s+engineering(\s+and\s+technology)?|\bbuet\b)/i, code: 'BD' },
  { pattern: /\b(university\s+of\s+dhaka|dhaka\s+university)\b/i, code: 'BD' },
  { pattern: /\b(brac\s+university|\bbracu\b)/i, code: 'BD' },
  { pattern: /\b(north\s+south\s+university|\bnsu\b)/i, code: 'BD' },
  { pattern: /\b(islamic\s+university\s+of\s+technology|\biut\b)/i, code: 'BD' },
  { pattern: /\b(shahjalal\s+university(\s+of\s+science\s+and\s+technology)?|\bsust\b)/i, code: 'BD' },
  { pattern: /\b(jahangirnagar\s+university)\b/i, code: 'BD' },
  { pattern: /\b(rajshahi\s+university)\b/i, code: 'BD' },
  { pattern: /\b(khulna\s+university(\s+of\s+engineering\s+&\s+technology)?|\bkuet\b)/i, code: 'BD' },
  { pattern: /\b(chittagong\s+university(\s+of\s+engineering\s+&\s+technology)?|\bcuet\b)/i, code: 'BD' },
  { pattern: /\b(ahsanullah\s+university(\s+of\s+science\s+and\s+technology)?|\baust\b)/i, code: 'BD' },
  { pattern: /\b(east\s+west\s+university|\bewu\b)/i, code: 'BD' },
  { pattern: /\b(united\s+international\s+university|\buiu\b)/i, code: 'BD' },
  { pattern: /\b(american\s+international\s+university[- ]bangladesh|\baiub\b)/i, code: 'BD' },
  { pattern: /\b(daffodil\s+international\s+university|\bdiu\b)/i, code: 'BD' },
  { pattern: /\b(bangladesh\s+agricultural\s+university|\bbau\b)/i, code: 'BD' },
  { pattern: /\b(icddr,?b|international\s+centre\s+for\s+diarrhoeal\s+disease)\b/i, code: 'BD' },

  // United States (US)
  { pattern: /\b(massachusetts\s+institute\s+of\s+technology|\bmit\b)/i, code: 'US' },
  { pattern: /\b(harvard\s+university)\b/i, code: 'US' },
  { pattern: /\b(stanford\s+university)\b/i, code: 'US' },
  { pattern: /\b(university\s+of\s+california|berkeley|\bucla\b)\b/i, code: 'US' },
  { pattern: /\b(carnegie\s+mellon)\b/i, code: 'US' },
  { pattern: /\b(columbia\s+university)\b/i, code: 'US' },
  { pattern: /\b(cornell\s+university)\b/i, code: 'US' },
  { pattern: /\b(princeton\s+university)\b/i, code: 'US' },
  { pattern: /\b(yale\s+university)\b/i, code: 'US' },
  { pattern: /\b(university\s+of\s+washington)\b/i, code: 'US' },
  { pattern: /\b(university\s+of\s+michigan)\b/i, code: 'US' },
  { pattern: /\b(university\s+of\s+texas)\b/i, code: 'US' },
  { pattern: /\b(georgia\s+institute\s+of\s+technology|georgia\s+tech)\b/i, code: 'US' },

  // United Kingdom (GB)
  { pattern: /\b(university\s+of\s+oxford|\boxford\b)/i, code: 'GB' },
  { pattern: /\b(university\s+of\s+cambridge|\bcambridge\b)/i, code: 'GB' },
  { pattern: /\b(imperial\s+college\s+london)\b/i, code: 'GB' },
  { pattern: /\b(university\s+college\s+london|\bucl\b)/i, code: 'GB' },
  { pattern: /\b(university\s+of\s+edinburgh)\b/i, code: 'GB' },
  { pattern: /\b(king'?s\s+college\s+london|\bkcl\b)/i, code: 'GB' },
  { pattern: /\b(university\s+of\s+manchester)\b/i, code: 'GB' },

  // Canada (CA)
  { pattern: /\b(ontario|quebec|british\s+columbia|alberta)\b/i, code: 'CA' },
  { pattern: /\b(university\s+of\s+toronto|\buoft\b)/i, code: 'CA' },
  { pattern: /\b(mcgill\s+university)\b/i, code: 'CA' },
  { pattern: /\b(university\s+of\s+british\s+columbia|\bubc\b)/i, code: 'CA' },
  { pattern: /\b(university\s+of\s+waterloo)\b/i, code: 'CA' },

  // Australia (AU)
  { pattern: /\b(sydney|melbourne|queensland|brisbane)\b/i, code: 'AU' },
  { pattern: /\b(university\s+of\s+melbourne)\b/i, code: 'AU' },
  { pattern: /\b(university\s+of\s+sydney)\b/i, code: 'AU' },
  { pattern: /\b(australian\s+national\s+university|\banu\b)/i, code: 'AU' },
  { pattern: /\b(monash\s+university)\b/i, code: 'AU' },
  { pattern: /\b(unsw|university\s+of\s+new\s+south\s+wales)\b/i, code: 'AU' },

  // Germany (DE)
  { pattern: /\b(berlin|munich|münchen|heidelberg)\b/i, code: 'DE' },
  { pattern: /\b(technical\s+university\s+of\s+munich|\btum\b)/i, code: 'DE' },
  { pattern: /\b(lmu\s+munich|ludwig-maximilians)\b/i, code: 'DE' },
  { pattern: /\b(heidelberg\s+university)\b/i, code: 'DE' },
  { pattern: /\b(max\s+planck)\b/i, code: 'DE' },

  // India (IN)
  { pattern: /\b(delhi|mumbai|bangalore|bengaluru|kolkata|chennai|hyderabad)\b/i, code: 'IN' },
  { pattern: /\b(indian\s+institute\s+of\s+technology|\biit\b)/i, code: 'IN' },
  { pattern: /\b(indian\s+institute\s+of\s+science|\biisc\b)/i, code: 'IN' },

  // Japan (JP)
  { pattern: /\b(tokyo|kyoto|osaka|tohoku|nagoya)\b/i, code: 'JP' },
  { pattern: /\b(university\s+of\s+tokyo)\b/i, code: 'JP' },
  { pattern: /\b(kyoto\s+university)\b/i, code: 'JP' },
];

/**
 * Resolves an ISO-3166 alpha-2 country code from institution name or affiliation text.
 * @param {string|object} candidate - Institution name, affiliation string, or object with name/university
 * @returns {string|null} - Uppercase 2-letter ISO code or null
 */
function resolveCountryCode(candidate) {
  if (!candidate) return null;

  // 1. Direct object inspection for verified country code
  if (typeof candidate === 'object') {
    const directCode =
      candidate.countryCode ||
      candidate.country_code ||
      candidate.awardingInstitution?.countryCode ||
      candidate.awardingInstitution?.country_code;

    if (typeof directCode === 'string' && /^[A-Za-z]{2}$/.test(directCode.trim())) {
      return directCode.trim().toUpperCase();
    }
  }

  // 2. Direct string 2-letter ISO code check
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (/^[A-Za-z]{2}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
  }

  // 3. Extract clean text to evaluate
  let text = '';
  if (typeof candidate === 'string') {
    text = candidate.trim();
  } else if (typeof candidate === 'object') {
    text = [
      candidate.name,
      candidate.university,
      candidate.rawAffiliation,
      candidate.affiliation,
      candidate.awardingInstitution?.name,
    ]
      .filter((t) => typeof t === 'string' && t.trim())
      .join(', ');
  }

  if (!text) return null;

  // 4. Check explicit country name patterns FIRST
  for (const item of EXPLICIT_COUNTRY_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.code.toUpperCase();
    }
  }

  // 5. Check disambiguated institution regex patterns (includes RMIT, KAUST, etc.)
  for (const item of INSTITUTION_COUNTRY_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.code.toUpperCase();
    }
  }

  // 6. Check curated institutions list with strict word boundary check
  const lowerText = text.toLowerCase();
  for (const cur of CURATED_INSTITUTIONS) {
    if (!cur.countryCode) continue;

    // Check full institution name
    if (cur.name) {
      const curLower = cur.name.toLowerCase();
      if (lowerText === curLower || new RegExp(`\\b${escapeRegex(curLower)}\\b`, 'i').test(text)) {
        return cur.countryCode.toUpperCase();
      }
    }

    // Check aliases with strict word boundaries (prevents RMIT matching MIT)
    if (Array.isArray(cur.aliases)) {
      for (const alias of cur.aliases) {
        if (!alias) continue;
        const aliasLower = alias.toLowerCase();
        // Skip short 2-letter ambiguous aliases in generic text
        if (aliasLower.length <= 2) continue;
        if (new RegExp(`\\b${escapeRegex(aliasLower)}\\b`, 'i').test(text)) {
          return cur.countryCode.toUpperCase();
        }
      }
    }
  }

  return null;
}

module.exports = {
  resolveCountryCode,
  INSTITUTION_COUNTRY_PATTERNS,
  EXPLICIT_COUNTRY_PATTERNS,
};
