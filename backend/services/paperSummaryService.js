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

const PROMPT_VERSION = 'v2';
const MODEL_VERSION = 'grounded-extractor-v2';
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
 * Constructs substantive, domain-aware inferred scope limitations
 * when explicit author limitations are absent or to complement them.
 */
function generateCautiousInferredScope(abstractText, dataset, methodology, objective, hasAuthorStated, language = 'en') {
  const textLower = (abstractText || '').toLowerCase();

  // Extract a clean benchmark / dataset snippet if available
  let samplePhrase = '';
  if (dataset) {
    const match = dataset.match(/(?:evaluated on|tested on|benchmark|dataset|corpus|sample of|cohort of)\s+([^,.;]+)/i);
    if (match && match[1]) {
      samplePhrase = match[1].trim();
    } else {
      const words = dataset.split(/\s+/).slice(0, 8).join(' ');
      samplePhrase = words.replace(/[.;]+$/, '');
    }
  }

  // Detect domain specifics
  let domainScopeEn = '';
  let domainScopeBn = '';

  if (/(?:neural|deep learning|transformer|model|algorithm|trained|cnn|gnn|llm|parameter|gpu|inference|architecture)/i.test(textLower)) {
    domainScopeEn = 'Computational complexity, resource consumption at scale, and degradation under out-of-distribution domain shifts are unexamined in the abstract.';
    domainScopeBn = 'কম্পিউটেশনাল জটিলতা, উচ্চ রিসোর্স খরচ এবং ডোমেন পরিবর্তনের ক্ষেত্রে মডেলের কার্যকারিতা সারসংক্ষেপে অনুল্লিখিত।';
  } else if (/(?:clinical|patient|disease|medical|biomedical|diagnosis|drug|therapy|health|hospital)/i.test(textLower)) {
    domainScopeEn = 'Participant demographic diversity, potential selection bias, and longitudinal safety or efficacy are not documented in the abstract.';
    domainScopeBn = 'অংশগ্রহণকারীদের জনসংখ্যার বৈচিত্র্য, সম্ভাব্য পক্ষপাত এবং দীর্ঘমেয়াদী নিরাপত্তা সারসংক্ষেপে নথিভুক্ত নয়।';
  } else if (/(?:perovskite|solar|material|chemical|synthesis|photovoltaic|nanoparticle|polymer)/i.test(textLower)) {
    domainScopeEn = 'Device stability under ambient atmospheric conditions, commercial fabrication scalability, and chemical toxicity bounds require full-text verification.';
    domainScopeBn = 'বায়ুমণ্ডলীয় পরিবেশে ডিভাইসের স্থায়িত্ব এবং বাণিজ্যিক স্কেলে উৎপাদনযোগ্যতা পূর্ণ গবেষণাপত্রে যাচাইযোগ্য।';
  } else if (/(?:economic|socioeconomic|micro-credit|financial|policy|poverty|household|market)/i.test(textLower)) {
    domainScopeEn = 'Causal inference may be constrained by unobserved institutional confounders, regional specificity, and macroeconomic shifts.';
    domainScopeBn = 'আঞ্চলিক প্রাতিষ্ঠানিক ভিন্নতা এবং সামষ্টিক অর্থনৈতিক পরিবর্তন দ্বারা গবেষণার ফলাফল প্রভাবিত হতে পারে।';
  } else {
    domainScopeEn = 'Methodological assumptions, baseline model hyperparameter sensitivity, and unconstrained real-world deployment bounds remain unaddressed in the abstract.';
    domainScopeBn = 'পদ্ধতিগত অনুমান এবং বাস্তব ক্ষেত্রে প্রয়োগের সীমাবদ্ধতা সারসংক্ষেপে বিস্তারিতভাবে আলোচিত হয়নি।';
  }

  let sampleScopeEn = '';
  let sampleScopeBn = '';
  if (samplePhrase) {
    sampleScopeEn = `Evaluation is bounded to the reported setting (${samplePhrase}). External validity across diverse or out-of-distribution domains is not verified in the abstract.`;
    sampleScopeBn = `মূল্যায়ন উল্লিখিত প্রেক্ষাপটে (${samplePhrase}) সীমাবদ্ধ। বিস্তৃত ক্ষেত্রে এর সাধারণীকরণ সারসংক্ষেপে যাচাই করা হয়নি।`;
  } else {
    sampleScopeEn = 'The abstract does not report specific empirical benchmark datasets, cohort sample sizes, or baseline comparison metrics, requiring full-text inspection.';
    sampleScopeBn = 'সারসংক্ষেপে নির্দিষ্ট তথ্যসেট বা নমুনার আকার উল্লেখ করা হয়নি, যা যাচাইয়ের জন্য মূল গবেষণাপত্র পর্যালোচনা প্রয়োজন।';
  }

  if (language === 'bn') {
    if (hasAuthorStated) {
      return `লেখকের উল্লিখিত সীমাবদ্ধতার পাশাপাশি: ১. মূল্যায়নের পরিধি: ${sampleScopeBn} ২. পদ্ধতিগত অনুমান: ${domainScopeBn}`;
    }
    return `১. মূল্যায়নের পরিধি: ${sampleScopeBn} ২. পদ্ধতিগত অনুমান: ${domainScopeBn}`;
  }

  if (hasAuthorStated) {
    return `In addition to author-stated constraints: 1. Evaluation Scope: ${sampleScopeEn} 2. Methodological Assumptions: ${domainScopeEn}`;
  }
  return `1. Evaluation Scope: ${sampleScopeEn} 2. Methodological Assumptions: ${domainScopeEn}`;
}

/**
 * Deterministic, grounded extractor that parses scholarly abstract text
 * into verifiable structured components without hallucination.
 */
function extractGroundedAbstractSummary(abstractText, language = 'en', fullTextSections = []) {
  const sentences = splitIntoSentences(abstractText);
  if (sentences.length === 0) {
    return null;
  }

  let objective = '';
  let methodology = '';
  let dataset = '';
  let findings = '';
  let limitations = '';
  let contributions = '';
  let future = '';

  const objKeywords = ['objective', 'aim', 'propose', 'investigate', 'study examines', 'we present', 'this paper', 'this work', 'addresses', 'focuses on'];
  const methKeywords = ['method', 'approach', 'model', 'algorithm', 'framework', 'technique', 'architecture', 'pipeline', 'trained', 'implemented'];
  const dataKeywords = ['dataset', 'corpus', 'sample', 'participants', 'benchmark', 'survey', 'collected', 'interviews', 'records'];
  const findKeywords = ['results show', 'found that', 'demonstrate', 'achieves', 'outperforms', 'findings indicate', 'conclude', 'shows that', 'reveal', 'accuracy', 'improved'];
  const limKeywords = [
    'limitation', 'limitations', 'limiting factor', 'limiting factors',
    'drawback', 'drawbacks',
    'shortcoming', 'shortcomings',
    'weakness', 'weaknesses',
    'caveat', 'caveats',
    'pitfall', 'pitfalls',
    'deficiency', 'deficiencies',
    'trade-off', 'tradeoff', 'trade-offs', 'tradeoffs',
    'bottleneck', 'bottlenecks',
    'overhead', 'computational cost', 'computationally expensive', 'high latency', 'memory footprint',
    'fails to', 'failed to', 'failure mode', 'failure modes',
    'unable to', 'inability to',
    'struggles to', 'struggles with',
    'degrades under', 'degradation', 'performance drops',
    'vulnerable to', 'susceptible to', 'prone to', 'sensitive to',
    'restricted to', 'is restricted', 'are restricted',
    'limited to', 'is limited', 'are limited', 'limited by',
    'constrained by', 'constraints', 'constraint',
    'scope is limited', 'narrow scope',
    'small sample', 'lack of', 'lacks',
    'not suitable for', 'not applicable to', 'does not account for',
    'unresolved', 'remains a challenge', 'remain a challenge', 'remains challenging', 'remain challenging', 'challenges remain', 'open challenge', 'open problem',
    'however,', '; however', 'however ',
    'although,', 'although ', 'albeit ',
    'despite ', 'in spite of ',
    'nevertheless,', 'nonetheless,',
  ];
  const contribKeywords = ['contribution', 'introduce', 'present a novel', 'we developed', 'key advance', 'first study to'];
  const futureKeywords = ['future work', 'future research', 'further investigation', 'plans to', 'next step'];

  // 1. Check full-text sections for explicit Limitations / Threats to Validity / Discussion sections
  let sectionLimitations = '';
  if (Array.isArray(fullTextSections) && fullTextSections.length > 0) {
    for (const sec of fullTextSections) {
      const titleLower = (sec.title || '').toLowerCase();
      if (
        titleLower.includes('limitation') ||
        titleLower.includes('threats to validity') ||
        titleLower.includes('scope and constraint') ||
        titleLower.includes('discussion and limit')
      ) {
        const secSentences = splitIntoSentences(sec.content || '');
        if (secSentences.length > 0) {
          sectionLimitations = secSentences.slice(0, 3).join(' ');
          break;
        }
      }
    }
  }

  // 2. Identify author-stated limitations in text
  const foundLimitationSentences = [];
  if (sectionLimitations) {
    foundLimitationSentences.push(sectionLimitations);
  } else {
    for (const s of sentences) {
      const sLower = s.toLowerCase();
      if (limKeywords.some((k) => sLower.includes(k))) {
        if (!foundLimitationSentences.includes(s)) {
          foundLimitationSentences.push(s);
        }
      }
    }
  }

  if (foundLimitationSentences.length > 0) {
    limitations = foundLimitationSentences.slice(0, 2).join(' ');
  }

  // 3. Extract other sections without conflicting with limitation statements
  for (const s of sentences) {
    const sLower = s.toLowerCase();
    const isLimSentence = foundLimitationSentences.includes(s);

    if (!objective && objKeywords.some((k) => sLower.includes(k)) && !isLimSentence) {
      objective = s;
    }
    if (!methodology && methKeywords.some((k) => sLower.includes(k)) && !isLimSentence) {
      methodology = s;
    }
    if (!dataset && dataKeywords.some((k) => sLower.includes(k))) {
      dataset = s;
    }
    if (!findings && findKeywords.some((k) => sLower.includes(k)) && !isLimSentence) {
      findings = s;
    }
    if (!contributions && contribKeywords.some((k) => sLower.includes(k)) && !isLimSentence) {
      contributions = s;
    }
    if (!future && futureKeywords.some((k) => sLower.includes(k))) {
      future = s;
    }
  }

  // Fallbacks if distinct keywords were not segregated
  if (!objective && sentences[0]) {
    objective = sentences[0];
  }
  if (!findings) {
    for (let i = sentences.length - 1; i >= 0; i--) {
      if (!foundLimitationSentences.includes(sentences[i])) {
        findings = sentences[i];
        break;
      }
    }
  }
  if (!findings && sentences.length > 2) {
    findings = sentences[sentences.length - 1];
  }
  if (!methodology && sentences.length > 1) {
    methodology = !foundLimitationSentences.includes(sentences[1]) ? sentences[1] : (sentences[2] || sentences[1]);
  }

  const tldrSentences = sentences.slice(0, Math.min(3, sentences.length)).join(' ');
  const keyTerms = extractKeyTerms(abstractText);

  // Substantive, domain-aware inferred scope calculation
  const inferredScope = generateCautiousInferredScope(
    abstractText,
    dataset,
    methodology,
    objective,
    Boolean(limitations),
    language
  );

  // Missing information detection
  const missing = [];
  if (!dataset) missing.push('Specific benchmark dataset or cohort size not stated in abstract');
  if (!limitations) missing.push('Author-stated limitations not detailed in abstract');
  if (!future) missing.push('Future research directions not explicitly outlined in abstract');

  const confidenceRating = (objective && methodology && findings) ? 'high' : (objective || methodology ? 'moderate' : 'cautious');

  const fallbackLimEn = 'None explicitly stated by the authors in the abstract text.';
  const fallbackLimBn = 'লেখক কর্তৃক সারসংক্ষেপে কোনো সুস্পষ্ট সীমাবদ্ধতা উল্লেখ করা হয়নি।';

  if (language === 'bn') {
    return {
      tldr: `[সারাংশ] ${tldrSentences}`,
      oneSentenceTakeaway: `[সারাংশ] ${tldrSentences}`,
      plainLanguageOverview: tldrSentences,
      researchObjective: objective || 'নির্দিষ্ট লক্ষ্য উল্লিখিত হয়নি',
      researchQuestion: objective || 'নির্দিষ্ট লক্ষ্য উল্লিখিত হয়নি',
      methodology: methodology || 'পদ্ধতি উল্লিখিত হয়নি',
      studyDesignAndMethods: methodology || 'পদ্ধতি উল্লিখিত হয়নি',
      datasetSample: dataset || 'তথ্যসেট বা নমুনা উল্লিখিত নেই',
      dataOrSample: dataset || 'তথ্যসেট বা নমুনা উল্লিখিত নেই',
      mainFindings: findings || 'প্রধান ফলাফল উল্লিখিত নেই',
      keyFindings: findings || 'প্রধান ফলাফল উল্লিখিত নেই',
      mainContributions: contributions || objective || 'প্রধান অবদান উল্লিখিত নেই',
      limitations: limitations || fallbackLimBn,
      authorStatedLimitations: limitations || fallbackLimBn,
      inferredLimitations: inferredScope,
      cautiousInferredLimitations: inferredScope,
      futureWork: future || 'ভবিষ্যৎ কাজের দিকনির্দেশ উল্লিখিত নেই',
      relevanceForThesisResearch: 'সম্পর্কিত বিষয়ে সাহিত্য পর্যালোচনা এবং পদ্ধতিগত রেফারেন্স হিসেবে উপযোগী।',
      missingInformation: missing.join('; '),
      confidence: confidenceRating,
      isAiGenerated: false,
      generationType: 'grounded_extractive',
      keyTerms,
      evidence: [],
      evidenceReferences: [],
      disclaimer: 'কৃত্রিম বুদ্ধিমত্তা দ্বারা সংক্ষিপ্তকৃত; মূল গবেষণাপত্রের সাথে মিলিয়ে নিন।',
    };
  }

  return {
    tldr: tldrSentences,
    oneSentenceTakeaway: tldrSentences,
    plainLanguageOverview: tldrSentences,
    researchObjective: objective || 'Objective not explicitly distinguished in abstract text.',
    researchQuestion: objective || 'Objective not explicitly distinguished in abstract text.',
    methodology: methodology || 'Methodology details not separated in available abstract text.',
    studyDesignAndMethods: methodology || 'Methodology details not separated in available abstract text.',
    datasetSample: dataset || 'Not reported',
    dataOrSample: dataset || 'Not reported',
    mainFindings: findings || 'Findings not explicitly segregated in abstract text.',
    keyFindings: findings || 'Findings not explicitly segregated in abstract text.',
    mainContributions: contributions || objective || 'Core contribution presented in the reported methodology.',
    limitations: limitations || fallbackLimEn,
    authorStatedLimitations: limitations || fallbackLimEn,
    inferredLimitations: inferredScope,
    cautiousInferredLimitations: inferredScope,
    futureWork: future || 'Not detailed in available abstract text.',
    relevanceForThesisResearch: 'Useful as a methodological benchmark, background citation, or comparative baseline in related thesis inquiries.',
    missingInformation: missing.join('; '),
    confidence: confidenceRating,
    isAiGenerated: false,
    generationType: 'grounded_extractive',
    keyTerms,
    evidence: [],
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

  // Security entitlement check: Free tier and unauthenticated guests must receive no summary benefit
  if (entitlements && (entitlements.plan === 'free' || entitlements.plan === 'guest' || entitlements.quotas?.canUsePaperSummarizer === false || entitlements.quotas?.dailySummaryGenerationLimit === 0)) {
    return {
      enabled: true,
      error: true,
      statusCode: 403,
      code: 'FEATURE_LOCKED',
      feature: 'paper_summary',
      message: 'Quick Summary is an exclusive benefit for 7-Day Trial and Premium members. Please activate your trial or upgrade to Premium.',
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
    generatedSummary = extractGroundedAbstractSummary(sourceText, language, paper.fullTextSections || []);

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
