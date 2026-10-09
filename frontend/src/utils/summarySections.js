
const LABELS = {
  en: {
    takeaway: 'Opening sentence of the abstract',
    objective: 'Research question',
    methodology: 'Methods',
    dataset: 'Data / sample',
    findings: 'Key findings',
    contributions: 'Contributions',
    limitations: 'Limitations stated by the authors',
    futureWork: 'Future work',
    alsoCovers: 'Also covers',
    notFound: 'Not found in this text',
    limitationsMissing: 'The authors state no limitations in this text.',
    checklist: 'Check these in the full paper',
    checklistNote: 'General points added by this site for this kind of study. The authors did not write them.',
    keyTerms: 'Key terms',
    evidence: 'Where this comes from in the paper',
  },
  bn: {
    takeaway: 'সারসংক্ষেপের প্রথম বাক্য',
    objective: 'গবেষণার প্রশ্ন',
    methodology: 'পদ্ধতি',
    dataset: 'তথ্য / নমুনা',
    findings: 'প্রধান ফলাফল',
    contributions: 'অবদান',
    limitations: 'লেখকদের উল্লিখিত সীমাবদ্ধতা',
    futureWork: 'ভবিষ্যৎ কাজ',
    alsoCovers: 'এতে আরও আছে',
    notFound: 'এই লেখায় পাওয়া যায়নি',
    limitationsMissing: 'লেখকেরা এই লেখায় কোনো সীমাবদ্ধতা উল্লেখ করেননি।',
    checklist: 'মূল গবেষণাপত্রে এগুলো যাচাই করুন',
    checklistNote: 'এই ধরনের গবেষণার জন্য সাইটের যোগ করা সাধারণ বিষয়। লেখকেরা এগুলো লেখেননি।',
    keyTerms: 'মূল শব্দ',
    evidence: 'গবেষণাপত্রের কোন অংশ থেকে নেওয়া',
  },
};

const PLACEHOLDER_PATTERNS = [
  /^not reported\.?$/i,
  /^none explicitly stated/i,
  /not explicitly distinguished in abstract/i,
  /not separated in available abstract/i,
  /not explicitly segregated in abstract/i,
  /^not detailed in available abstract/i,
  /^core contribution presented in the reported methodology/i,
  /^useful as a methodological benchmark/i,
  /উল্লিখিত হয়নি/,
  /উল্লিখিত নেই/,
  /উল্লেখ করা হয়নি/,
  /^সম্পর্কিত বিষয়ে সাহিত্য পর্যালোচনা/,
];

const SECTION_ORDER = ['objective', 'methodology', 'dataset', 'findings', 'contributions'];

const FIELD_NAMES = {
  objective: ['researchQuestion', 'researchObjective'],
  methodology: ['studyDesignAndMethods', 'methodology'],
  dataset: ['dataOrSample', 'datasetSample'],
  findings: ['keyFindings', 'mainFindings'],
  contributions: ['mainContributions'],
  limitations: ['authorStatedLimitations', 'limitations'],
  futureWork: ['futureWork'],
};

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isPlaceholderText(value) {
  const text = clean(value);
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function readField(summary, key) {
  for (const name of FIELD_NAMES[key]) {
    const text = clean(summary[name]);
    if (text) return text;
  }
  return '';
}

function foundText(summary, key) {
  const text = readField(summary, key);
  if (!text) return '';
  const flag = summary.found && typeof summary.found[key] === 'boolean' ? summary.found[key] : null;
  if (flag === false) return '';
  if (flag === true) return text;
  return isPlaceholderText(text) ? '' : text;
}

function sameSentence(a, b) {
  const norm = (s) => clean(s).toLowerCase().replace(/[.\s]+$/, '');
  return Boolean(a) && Boolean(b) && norm(a) === norm(b);
}

export function splitChecklist(value) {
  const text = clean(value);
  if (!text) return [];
  const body = text.replace(/^.*?(?:1|১)\.\s+/, '');
  return body
    .split(/\s+(?:[2-9]|[২-৯])\.\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const colon = item.indexOf(': ');
      if (colon > 0 && colon <= 40) {
        return { title: item.slice(0, colon), text: item.slice(colon + 2).trim() };
      }
      return { title: '', text: item };
    });
}

export function getSummaryLabels(language = 'en') {
  return LABELS[language === 'bn' ? 'bn' : 'en'];
}

export function buildSummaryView(summary, language = 'en') {
  const labels = getSummaryLabels(language);
  if (!summary || typeof summary !== 'object') {
    return {
      labels,
      takeaway: '',
      takeawayAlsoCovers: [],
      overview: '',
      sections: [],
      notFound: [],
      limitations: { text: '', stated: false },
      futureWork: '',
      checklist: [],
      keyTerms: [],
      evidence: [],
    };
  }

  const takeaway = clean(summary.oneSentenceTakeaway || summary.tldr).replace(/^\[[^\]]{1,20}\]\s*/, '');

  const takeawayAlsoCovers = [];
  const sections = [];
  const notFound = [];

  for (const key of SECTION_ORDER) {
    const text = foundText(summary, key);
    if (!text) {
      notFound.push(labels[key]);
      continue;
    }
    if (sameSentence(text, takeaway)) {
      takeawayAlsoCovers.push(labels[key]);
      continue;
    }
    const existing = sections.find((section) => sameSentence(section.text, text));
    if (existing) {
      existing.keys.push(key);
      existing.headings.push(labels[key]);
    } else {
      sections.push({ keys: [key], headings: [labels[key]], text });
    }
  }

  const limitationText = foundText(summary, 'limitations');
  const futureWork = foundText(summary, 'futureWork');
  if (!futureWork) notFound.push(labels.futureWork);

  const overview = clean(summary.plainLanguageOverview);
  const evidence = (Array.isArray(summary.evidence) && summary.evidence.length > 0
    ? summary.evidence
    : Array.isArray(summary.evidenceReferences)
      ? summary.evidenceReferences
      : []
  ).filter((item) => item && clean(item.quote));

  return {
    labels,
    takeaway,
    takeawayAlsoCovers,
    overview: overview && !isPlaceholderText(overview) && !sameSentence(overview, takeaway) && !overview.startsWith(takeaway) ? overview : '',
    sections,
    notFound,
    limitations: { text: limitationText, stated: Boolean(limitationText) },
    futureWork,
    checklist: splitChecklist(summary.cautiousInferredLimitations || summary.inferredLimitations),
    keyTerms: Array.isArray(summary.keyTerms) ? summary.keyTerms.map(clean).filter(Boolean) : [],
    evidence,
  };
}

export function buildSummaryCopyText(title, summary, language = 'en') {
  const view = buildSummaryView(summary, language);
  const { labels } = view;
  const lines = [];

  if (clean(title)) lines.push(clean(title));
  if (view.takeaway) {
    const also = view.takeawayAlsoCovers.length > 0 ? ` (${labels.alsoCovers.toLowerCase()}: ${view.takeawayAlsoCovers.join(', ')})` : '';
    lines.push(`${labels.takeaway}${also}:\n${view.takeaway}`);
  }
  if (view.overview) lines.push(view.overview);
  for (const section of view.sections) {
    lines.push(`${section.headings.join(' + ')}:\n${section.text}`);
  }
  lines.push(`${labels.limitations}:\n${view.limitations.stated ? view.limitations.text : labels.limitationsMissing}`);
  if (view.futureWork) lines.push(`${labels.futureWork}:\n${view.futureWork}`);
  if (view.notFound.length > 0) lines.push(`${labels.notFound}: ${view.notFound.join(', ')}`);
  if (view.checklist.length > 0) {
    lines.push(
      `${labels.checklist} (${labels.checklistNote})\n${view.checklist
        .map((item) => `- ${item.title ? `${item.title}: ` : ''}${item.text}`)
        .join('\n')}`
    );
  }
  if (view.keyTerms.length > 0) lines.push(`${labels.keyTerms}: ${view.keyTerms.join(', ')}`);
  if (Array.isArray(summary.researchDirections) && summary.researchDirections.length) {
    lines.push('Possible thesis directions (AI suggestions; novelty is not established):\n' +
      summary.researchDirections.map((item) => '- ' + item.text + '\n  Evidence — ' + item.sectionOrPage + ': "' + item.quote + '"').join('\n'));
  }
  if (summary.isAiGenerated && view.evidence.length) {
    lines.push('Supporting evidence:\n' + view.evidence.map((item) => '- ' + (item.field || 'Source') + ' — ' + item.sectionOrPage + ': "' + item.quote + '"').join('\n'));
  }
  lines.push(summary.disclaimer || "[Sentences taken from the paper's own text by keyword rules, via The Thesis Archive. Not written by AI. Check the original paper.]");

  return lines.join('\n\n');
}


const FULL_TEXT_LABELS = {
  en: {
    title: 'From the full paper',
    note: 'Copied from the paper’s PDF, word for word. Not written by AI.',
    limitations: 'Limitations',
    futureWork: 'Future work',
    conclusion: 'Conclusion',
    dataAvailability: 'Data availability',
    codeAvailability: 'Code availability',
    section: 'Section',
    page: 'page',
    insideSection: 'found inside this section',
    continues: 'The section continues in the paper.',
    nothing: 'The PDF was read, but it has no section or sentences on limitations, future work, conclusion or data.',
    links: 'Data and code links in the paper',
    dataset: 'Data',
    code: 'Code',
    other: 'Link',
    pagesRead: (read, total) => (read < total ? `${read} of ${total} pages read` : `${total} ${total === 1 ? 'page' : 'pages'} read`),
    viaFinder: 'Free copy found through Unpaywall',
    openPdf: 'Open the PDF',
  },
  bn: {
    title: 'সম্পূর্ণ গবেষণাপত্র থেকে',
    note: 'গবেষণাপত্রের পিডিএফ থেকে হুবহু নেওয়া। কৃত্রিম বুদ্ধিমত্তার লেখা নয়।',
    limitations: 'সীমাবদ্ধতা',
    futureWork: 'ভবিষ্যৎ কাজ',
    conclusion: 'উপসংহার',
    dataAvailability: 'তথ্যের প্রাপ্যতা',
    codeAvailability: 'কোডের প্রাপ্যতা',
    section: 'অংশ',
    page: 'পৃষ্ঠা',
    insideSection: 'এই অংশের ভেতরে পাওয়া',
    continues: 'অংশটি গবেষণাপত্রে আরও আছে।',
    nothing: 'পিডিএফ পড়া হয়েছে, কিন্তু এতে সীমাবদ্ধতা, ভবিষ্যৎ কাজ, উপসংহার বা তথ্য নিয়ে কোনো অংশ পাওয়া যায়নি।',
    links: 'গবেষণাপত্রে থাকা তথ্য ও কোডের লিংক',
    dataset: 'তথ্য',
    code: 'কোড',
    other: 'লিংক',
    pagesRead: (read, total) => (read < total ? `${total} পৃষ্ঠার মধ্যে ${read} পৃষ্ঠা পড়া হয়েছে` : `${total} পৃষ্ঠা পড়া হয়েছে`),
    viaFinder: 'আনপেওয়াল-এর মাধ্যমে বিনামূল্যের কপি পাওয়া গেছে',
    openPdf: 'পিডিএফ খুলুন',
  },
};

const FULL_TEXT_ORDER = ['limitations', 'futureWork', 'conclusion', 'dataAvailability', 'codeAvailability'];

function safeHttpUrl(value) {
  const text = clean(value);
  return /^https?:\/\//i.test(text) ? text : '';
}

export function getFullTextLabels(language = 'en') {
  return FULL_TEXT_LABELS[language === 'bn' ? 'bn' : 'en'];
}

export function buildFullTextView(data, language = 'en') {
  const labels = getFullTextLabels(language);
  const empty = { labels, available: false, blocks: [], links: [], pagesNote: '', pdfUrl: '', viaFinder: false };
  if (!data || typeof data !== 'object' || data.available !== true) return empty;

  const key = data.keySections && typeof data.keySections === 'object' ? data.keySections : {};
  const blocks = [];
  for (const name of FULL_TEXT_ORDER) {
    const item = key[name];
    const text = item && typeof item.text === 'string' ? item.text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';
    if (!text) continue;
    const same = blocks.find((b) => b.text === text);
    if (same) {
      same.headings.push(labels[name]);
      same.keys.push(name);
      continue;
    }
    blocks.push({
      keys: [name],
      headings: [labels[name]],
      text,
      sectionTitle: clean(item.sectionTitle),
      page: Number.isFinite(Number(item.page)) && Number(item.page) > 0 ? Number(item.page) : null,
      insideSection: item.source === 'within_section',
      truncated: Boolean(item.truncated),
    });
  }

  const seen = new Set();
  const links = (Array.isArray(data.links) ? data.links : [])
    .map((link) => ({
      url: safeHttpUrl(link && link.url),
      kind: link && (link.kind === 'dataset' || link.kind === 'code') ? link.kind : 'other',
      host: clean(link && link.host),
      page: link && Number.isFinite(Number(link.page)) && Number(link.page) > 0 ? Number(link.page) : null,
      context: clean(link && link.context),
    }))
    .filter((link) => link.url && !seen.has(link.url) && seen.add(link.url));

  const total = Number(data.pageCount) || 0;
  const read = Number(data.pagesRead) || total;

  return {
    labels,
    available: true,
    blocks,
    links,
    pagesNote: total > 0 ? labels.pagesRead(Math.min(read, total), total) : '',
    pdfUrl: safeHttpUrl(data.pdfUrl),
    viaFinder: data.foundVia === 'unpaywall',
  };
}

export function buildFullTextCopyText(data, language = 'en') {
  const view = buildFullTextView(data, language);
  if (!view.available || (view.blocks.length === 0 && view.links.length === 0)) return '';
  const { labels } = view;
  const lines = [`${labels.title} (${labels.note})`];
  for (const block of view.blocks) {
    const where = [block.sectionTitle ? `${labels.section}: ${block.sectionTitle}` : '', block.page ? `${labels.page} ${block.page}` : ''].filter(Boolean).join(', ');
    lines.push(`${block.headings.join(' + ')}${where ? ` [${where}]` : ''}:\n${block.text}`);
  }
  if (view.links.length > 0) {
    lines.push(`${labels.links}:\n${view.links.map((link) => `- ${labels[link.kind]}: ${link.url}`).join('\n')}`);
  }
  return lines.join('\n\n');
}
