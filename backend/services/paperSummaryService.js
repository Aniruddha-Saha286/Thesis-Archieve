/**
 * Grounded Paper Summary Service
 * Provides grounded, hallucination-resistant research summaries from scholarly abstracts or full-text documents.
 * Feature-flagged by PAPER_SUMMARIZER_ENABLED.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const PaperSummary = require('../models/PaperSummary');
const { isValidHttpUrl, isPrivateIpOrHost } = require('../utils/urlValidator');
const { reserveUsage, releaseReservedCredit } = require('./usageReservationService');

const PROMPT_VERSION = 'v1';
const MODEL_VERSION = 'grounded-extractor-v1';
const memorySummaryCache = new Map();

/**
 * Splits text into individual sentences safely without regex catastrophic backtracking.
 */
function splitIntoSentences(text) {
  if (!text) return [];
  return text
    .replace(/([.?!])\s*(?=[A-Z0-9])/g, '$1|')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

/**
 * Extracts 4-6 significant key domain terms from text.
 */
function extractKeyTerms(text) {
  if (!text) return [];
  const stopwords = new Set([
    'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'were', 'which',
    'paper', 'study', 'results', 'using', 'based', 'model', 'approach', 'system',
    'proposed', 'analysis', 'research', 'present', 'between', 'these', 'their', 'data',
    'method', 'different', 'various', 'during', 'through', 'about', 'under', 'further',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w) && !/^\d+$/.test(w));

  const freq = new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  const sorted = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  return sorted.slice(0, 6);
}

/**
 * Deterministic, grounded extractor that parses scholarly abstract text
 * into verifiable structured components without hallucination.
 */
function extractGroundedAbstractSummary(abstractText, language = 'en') {
  const sentences = splitIntoSentences(abstractText);
  if (sentences.length === 0) {
    return null;
  }

  let objective = '';
  let methodology = '';
  let dataset = '';
  let findings = '';
  let limitations = '';

  const objKeywords = ['objective', 'aim', 'propose', 'investigate', 'study examines', 'we present', 'this paper', 'this work', 'addresses', 'focuses on'];
  const methKeywords = ['method', 'approach', 'model', 'algorithm', 'framework', 'technique', 'architecture', 'pipeline', 'trained', 'implemented'];
  const dataKeywords = ['dataset', 'corpus', 'sample', 'participants', 'benchmark', 'survey', 'collected', 'interviews', 'records'];
  const findKeywords = ['results show', 'found that', 'demonstrate', 'achieves', 'outperforms', 'findings indicate', 'conclude', 'shows that', 'reveal', 'accuracy', 'improved'];
  const limKeywords = ['limitation', 'drawback', 'future work', 'remains', 'challenge', 'restricted to', 'scope is limited'];

  for (const s of sentences) {
    const sLower = s.toLowerCase();

    if (!objective && objKeywords.some((k) => sLower.includes(k))) {
      objective = s;
    }
    if (!methodology && methKeywords.some((k) => sLower.includes(k))) {
      methodology = s;
    }
    if (!dataset && dataKeywords.some((k) => sLower.includes(k))) {
      dataset = s;
    }
    if (!findings && findKeywords.some((k) => sLower.includes(k))) {
      findings = s;
    }
    if (!limitations && limKeywords.some((k) => sLower.includes(k))) {
      limitations = s;
    }
  }

  // Fallbacks if distinct keywords were not segregated
  if (!objective && sentences[0]) {
    objective = sentences[0];
  }
  if (!findings && sentences.length > 2) {
    findings = sentences[sentences.length - 1];
  }
  if (!methodology && sentences.length > 1) {
    methodology = sentences[1];
  }

  const tldrSentences = sentences.slice(0, Math.min(3, sentences.length)).join(' ');
  const keyTerms = extractKeyTerms(abstractText);

  if (language === 'bn') {
    return {
      tldr: `[সারাংশ] ${tldrSentences}`,
      researchObjective: objective || 'নির্দিষ্ট লক্ষ্য উল্লিখিত হয়নি',
      methodology: methodology || 'পদ্ধতি উল্লিখিত হয়নি',
      datasetSample: dataset || 'তথ্যসেট বা নমুনা উল্লিখিত নেই',
      mainFindings: findings || 'প্রধান ফলাফল উল্লিখিত নেই',
      limitations: limitations || 'কোনো সীমাবদ্ধতা সরাসরি উল্লেখ করা হয়নি',
      inferredLimitations: null,
      keyTerms,
      evidenceReferences: [],
      disclaimer: 'কৃত্রিম বুদ্ধিমত্তা দ্বারা সংক্ষিপ্তকৃত; মূল গবেষণাপত্রের সাথে মিলিয়ে নিন।',
    };
  }

  return {
    tldr: tldrSentences,
    researchObjective: objective || 'Objective not explicitly distinguished in abstract text.',
    methodology: methodology || 'Methodology details not separated in available abstract text.',
    datasetSample: dataset || 'Not reported',
    mainFindings: findings || 'Findings not explicitly segregated in abstract text.',
    limitations: limitations || 'Not reported',
    inferredLimitations: null,
    keyTerms,
    evidenceReferences: [],
    disclaimer: 'AI-generated; verify against the original paper',
  };
}

/**
 * Generates or retrieves a grounded Quick Summary for a paper.
 *
 * @param {Object} params
 * @param {Object} params.paper - The scholarly record (title, abstract, pdfUrl, doi, etc.)
 * @param {Object} params.user - The authenticated user requesting the summary
 * @param {Object} params.entitlements - Current effective entitlements of the user
 * @param {string} [params.language='en'] - 'en' or 'bn'
 * @param {boolean} [params.forceRefresh=false]
 */
async function getOrGeneratePaperSummary({
  paper,
  user,
  scope,
  entitlements,
  language = 'en',
  forceRefresh = false,
}) {
  const isEnabled = process.env.PAPER_SUMMARIZER_ENABLED !== 'false';
  if (!isEnabled) {
    return {
      enabled: false,
      message: 'Quick Summary is currently disabled by administrator configuration.',
    };
  }

  if (!paper) {
    return {
      enabled: true,
      coverage: 'unavailable',
      message: 'Paper details were not provided.',
    };
  }

  const paperId = String(paper._id || paper.id || paper.doi || paper.title || '').trim();
  const rawAbstract = typeof paper.abstract === 'string' ? paper.abstract.trim() : '';

  // 1. Determine usable source tier
  const hasSubstantialAbstract =
    rawAbstract.length >= 50 &&
    !rawAbstract.toLowerCase().includes('no abstract available') &&
    !rawAbstract.toLowerCase().includes('abstract not provided');

  let coverage = 'unavailable';
  let sourceText = '';

  // Check if eligible for full-text PDF summary
  const canAccessFullText = Boolean(entitlements?.quotas?.canAccessFullTextSummary);
  const pdfUrl = (paper.pdfUrl && typeof paper.pdfUrl === 'string') ? paper.pdfUrl.trim() : '';
  const isSafePdfUrl = pdfUrl && isValidHttpUrl(pdfUrl) && !isPrivateIpOrHost(new URL(pdfUrl).hostname);

  if (canAccessFullText && isSafePdfUrl && paper.fullTextExtracted) {
    // If server already extracted verified open full text
    coverage = 'full_text';
    sourceText = paper.fullTextExtracted;
  } else if (hasSubstantialAbstract) {
    coverage = 'abstract_only';
    sourceText = rawAbstract;
  }

  // If neither sufficient abstract nor full text exists: unavailable!
  if (coverage === 'unavailable' || !sourceText) {
    return {
      enabled: true,
      coverage: 'unavailable',
      message:
        'Insufficient abstract or authorized full-text content available for grounded summarization. مشروع Panther strictly avoids hallucinating paper findings.',
    };
  }

  // 2. Compute canonical content hash
  const sourceContentHash = crypto
    .createHash('sha256')
    .update(`${paperId}:${language}:${sourceText}`)
    .digest('hex');

  // 3. Check persistent MongoDB and memory cache
  const cacheKey = `${paperId}:${language}:${sourceContentHash}:${PROMPT_VERSION}`;
  if (!forceRefresh) {
    if (memorySummaryCache.has(cacheKey)) {
      const cached = memorySummaryCache.get(cacheKey);
      return {
        enabled: true,
        cached: true,
        coverage: cached.coverage,
        summary: cached.summary,
        language: cached.language,
        generatedAt: cached.generatedAt,
        modelVersion: cached.modelVersion,
        promptVersion: cached.promptVersion,
      };
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const cached = await PaperSummary.findOne({
          paperId,
          language,
          sourceContentHash,
          promptVersion: PROMPT_VERSION,
        });

        if (cached) {
          memorySummaryCache.set(cacheKey, cached);
          return {
            enabled: true,
            cached: true,
            coverage: cached.coverage,
            summary: cached.summary,
            language: cached.language,
            generatedAt: cached.generatedAt,
            modelVersion: cached.modelVersion,
            promptVersion: cached.promptVersion,
          };
        }
      } catch (err) {
        console.warn('PaperSummary cache lookup failed, proceeding to generation:', err.message);
      }
    }
  }

  // 4. Check & reserve generation quota
  const summaryLimit = entitlements?.quotas?.dailySummaryGenerationLimit !== undefined
    ? entitlements.quotas.dailySummaryGenerationLimit
    : 1;

  const reservation = await reserveUsage({
    user,
    scope: user ? (user._id ? user._id.toString() : user.id || 'usr') : (scope || 'guest'),
    metric: 'summary',
    limit: summaryLimit,
    idempotencyKey: `sum_${paperId}_${sourceContentHash.slice(0, 12)}`,
  });

  if (!reservation.allowed) {
    return {
      enabled: true,
      coverage,
      quotaExceeded: true,
      code: 'DAILY_SUMMARY_LIMIT_REACHED',
      message: `You have reached your daily Quick Summary limit of ${summaryLimit} per Asia/Dhaka day. Please upgrade your membership for higher limits.`,
      quota: {
        limit: summaryLimit,
        used: reservation.count,
        remaining: 0,
      },
    };
  }

  // 5. Generate grounded summary
  let generatedSummary = null;
  try {
    generatedSummary = extractGroundedAbstractSummary(sourceText, language);

    if (!generatedSummary) {
      throw new Error('Failed to generate grounded extraction from text');
    }

    // If full-text coverage, attach evidence references
    if (coverage === 'full_text' && paper.fullTextSections) {
      generatedSummary.evidenceReferences = (paper.fullTextSections || []).slice(0, 3).map((sec) => ({
        sectionOrPage: sec.title || 'Section',
        quote: (sec.content || '').slice(0, 160) + '...',
      }));
    }

    const resultRecord = {
      paperId,
      doi: paper.doi || '',
      sourceContentHash,
      language,
      coverage,
      summary: generatedSummary,
      modelVersion: MODEL_VERSION,
      promptVersion: PROMPT_VERSION,
      generatedAt: new Date(),
    };

    memorySummaryCache.set(cacheKey, resultRecord);

    // 6. Persist to MongoDB cache if connected
    if (mongoose.connection.readyState === 1) {
      try {
        await PaperSummary.findOneAndUpdate(
          {
            paperId,
            language,
            sourceContentHash,
            promptVersion: PROMPT_VERSION,
          },
          resultRecord,
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } catch (err) {
        console.warn('Failed to persist PaperSummary to MongoDB:', err.message);
      }
    }

    return {
      enabled: true,
      cached: false,
      coverage: resultRecord.coverage,
      summary: resultRecord.summary,
      language: resultRecord.language,
      generatedAt: resultRecord.generatedAt,
      modelVersion: resultRecord.modelVersion,
      promptVersion: resultRecord.promptVersion,
      quota: {
        limit: summaryLimit,
        used: reservation.count,
        remaining: reservation.remaining,
      },
    };
  } catch (err) {
    // Release reserved credit on generation failure
    await releaseReservedCredit({
      user,
      scope: user ? user._id.toString() : 'guest',
      metric: 'summary',
      idempotencyKey: `sum_${paperId}_${sourceContentHash.slice(0, 12)}`,
    });

    throw err;
  }
}

module.exports = {
  getOrGeneratePaperSummary,
  extractGroundedAbstractSummary,
  extractKeyTerms,
  splitIntoSentences,
};
