// Topic Check analysis.
// Pure functions only (no React, no network) so the logic can be tested on its own.
// Everything here is plain counting over the search results the server already returns.
// It never claims a topic is "novel": it reports what was found in the results that were checked.

const STOPWORDS = new Set(
  (
    'a an and are as at be been being but by can could did do does for from had has have how in into is it its ' +
    'of on or our over than that the their them then there these this those through to toward towards under up ' +
    'upon via was we were what when where which while who why will with within without would you your ' +
    // words that appear in almost every academic title and say nothing about the topic
    'using based use used approach approaches study studies analysis method methods methodology novel new ' +
    'toward case paper research thesis dissertation project system systems model models framework frameworks ' +
    'application applications technique techniques evaluation performance improved improving ' +
    'efficient effective proposed towards among between across'
  ).split(' ')
);

// Short tokens that are real research terms and must not be dropped by the length rule
const SHORT_TERMS = new Set(['ai', 'ml', 'dl', 'ar', 'vr', 'xr', 'ui', 'ux', 'iot', '5g', '6g', 'rl', 'cv', 'qa', 'ir', 'gan', 'gnn', 'cnn', 'rnn', 'llm', 'nlp', 'svm', 'knn', 'ocr', 'asr', 'eeg', 'ecg', 'mri', 'gis', 'sql', 'rag', 'uav']);

// Words ending in "s" that are not plurals
const NO_STRIP = /(ss|is|us|ics|ous)$/;

export function stem(word) {
  let w = String(word || '').toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('s') && !NO_STRIP.test(w)) w = w.slice(0, -1);
  return w;
}

// Returns [{ stem, word }] in first-seen order, one entry per stem.
export function extractKeywords(text) {
  const out = [];
  const seen = new Set();
  const tokens = String(text || '')
    .toLowerCase()
    // hyphens split too, so "low-resource" and "low resource" count as the same words.
    // \p{M} keeps Bangla vowel signs attached to their letters.
    .split(/[^\p{L}\p{M}\p{N}+#]+/u)
    .map((t) => t.replace(/^[+#]+/, ''));

  for (const word of tokens) {
    if (!word) continue;
    if (STOPWORDS.has(word)) continue;
    if (word.length < 3 && !SHORT_TERMS.has(word)) continue;
    if (/^\d+$/.test(word) && word.length !== 4) continue;
    const s = stem(word);
    if (STOPWORDS.has(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ stem: s, word });
  }
  return out;
}

function stemSet(text) {
  return new Set(extractKeywords(text).map((k) => k.stem));
}

export function recordKey(record) {
  if (!record) return '';
  if (record.doi) return `doi:${String(record.doi).toLowerCase()}`;
  const title = String(record.title || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
  return title ? `t:${title}` : `id:${record._id || record.id || ''}`;
}

export function isThesisRecord(record) {
  const type = String(record?.publicationType || '').toLowerCase();
  const degree = String(record?.degreeType || '').toLowerCase();
  return type === 'thesis' || type === 'dissertation' || /thesis|dissertation/.test(degree);
}

// A record that lives in this archive (deposited by students), not pulled from an outside index
export function isLocalRecord(record) {
  const providers = [record?.source, ...(Array.isArray(record?.sources) ? record.sources.map((s) => s?.provider) : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /local archive|local repository|thesis archive/.test(providers) || /^THESIS-/.test(String(record?.catalogId || ''));
}

export function recordUniversity(record) {
  return (
    record?.awardingInstitution?.name ||
    record?.university ||
    record?.authorships?.[0]?.institutions?.[0]?.name ||
    ''
  );
}

function recordCountry(record) {
  return (
    record?.awardingInstitution?.countryCode ||
    record?.countryCode ||
    record?.authorships?.[0]?.institutions?.[0]?.countryCode ||
    ''
  );
}

export function recordAuthor(record) {
  if (record?.authorDisplay) return record.authorDisplay;
  const fromShips = Array.isArray(record?.authorships) ? record.authorships.map((a) => a?.author?.name).filter(Boolean) : [];
  if (fromShips.length) return fromShips.length > 2 ? `${fromShips[0]} et al.` : fromShips.join(', ');
  if (record?.author) return record.author;
  const fromAuthors = Array.isArray(record?.authors) ? record.authors.map((a) => a?.name).filter(Boolean) : [];
  return fromAuthors.length > 2 ? `${fromAuthors[0]} et al.` : fromAuthors.join(', ');
}

// How much of the student's topic shows up in one record. 0..1
export function scoreRecord(topicKeywords, record) {
  if (!topicKeywords.length) return { score: 0, matched: [] };
  const titleStems = stemSet(record?.title);
  const bodyStems = stemSet(`${record?.title || ''} ${record?.abstract || ''}`);
  let inTitle = 0;
  let inBody = 0;
  const matched = [];
  for (const k of topicKeywords) {
    const t = titleStems.has(k.stem);
    const b = t || bodyStems.has(k.stem);
    if (t) inTitle += 1;
    if (b) {
      inBody += 1;
      matched.push(k.word);
    }
  }
  const n = topicKeywords.length;
  const score = 0.7 * (inTitle / n) + 0.3 * (inBody / n);
  return { score: Math.round(score * 100) / 100, matched };
}

export function matchLevel(score) {
  if (score >= 0.7) return 'close';
  if (score >= 0.4) return 'related';
  return 'loose';
}

export const VERDICTS = [
  {
    key: 'uncharted',
    label: 'Little found',
    headline: 'Almost nothing matching was found',
    advice:
      'Either this is new ground or the wording is too narrow. Try synonyms or a broader phrase before you rely on this, then ask a supervisor whether the topic is feasible.',
  },
  {
    key: 'open',
    label: 'Open angle',
    headline: 'Related work exists, but nothing with your exact combination',
    advice:
      'There is literature to build on and no close match in what was checked. Read the related work below and state clearly which part of your combination is new.',
  },
  {
    key: 'emerging',
    label: 'Emerging',
    headline: 'A small number of close matches',
    advice:
      'A few people have worked on nearly the same idea. Read them first: your contribution needs to differ in data, method, language or setting.',
  },
  {
    key: 'active',
    label: 'Active area',
    headline: 'An established topic with several close matches',
    advice:
      'This is a known topic, so finding sources will be easy. You need a specific angle: a new dataset, a local context, a comparison nobody ran, or a limitation someone left open.',
  },
  {
    key: 'crowded',
    label: 'Crowded',
    headline: 'Many close matches',
    advice:
      'A lot of work already covers this. Narrow it: add the domain, the language, the dataset or the method that makes yours different, then check again.',
  },
];

function pickVerdict(closeCount, relatedCount) {
  if (closeCount === 0 && relatedCount < 3) return 0;
  if (closeCount === 0) return 1;
  if (closeCount <= 2) return 2;
  if (closeCount <= 7) return 3;
  return 4;
}

export function analyzeTopic({ topic, records = [], thesisRecords = [], datasets = [], currentYear = new Date().getFullYear(), userUniversity = '' }) {
  const keywords = extractKeywords(topic);

  // Merge both result lists, first occurrence wins
  const byKey = new Map();
  for (const r of [...records, ...thesisRecords]) {
    if (!r || !r.title) continue;
    const key = recordKey(r);
    if (!byKey.has(key)) byKey.set(key, r);
  }

  const items = [...byKey.values()].map((record) => {
    const { score, matched } = scoreRecord(keywords, record);
    return { record, score, matched, level: matchLevel(score), year: Number(record.publishedYear) || null };
  });
  items.sort((a, b) => b.score - a.score || (b.record.citationCount || 0) - (a.record.citationCount || 0));

  const close = items.filter((i) => i.level === 'close');
  const related = items.filter((i) => i.level !== 'loose');

  // Activity by year, last 10 years
  const firstYear = currentYear - 9;
  const yearSeries = Array.from({ length: 10 }, (_, i) => ({ year: firstYear + i, count: 0 }));
  let earlier = 0;
  for (const i of related) {
    if (!i.year) continue;
    if (i.year < firstYear) earlier += 1;
    else if (i.year <= currentYear) yearSeries[i.year - firstYear].count += 1;
  }
  const recentCount = related.filter((i) => i.year && i.year >= currentYear - 2).length;

  // Theses (the part outside indexes cannot show well)
  const theses = related.filter((i) => isThesisRecord(i.record));
  const localTheses = theses.filter((i) => isLocalRecord(i.record));
  const bangladeshTheses = theses.filter((i) => String(recordCountry(i.record)).toUpperCase() === 'BD');
  const uniNeedle = String(userUniversity || '').trim().toLowerCase();
  const sameUniversity = uniNeedle
    ? theses.filter((i) => recordUniversity(i.record).toLowerCase().includes(uniNeedle))
    : [];

  const supervisorMap = new Map();
  for (const i of theses) {
    const name = String(i.record.advisor || '').trim();
    if (!name) continue;
    const entry = supervisorMap.get(name) || { name, count: 0, university: recordUniversity(i.record), titles: [] };
    entry.count += 1;
    if (entry.titles.length < 2) entry.titles.push(i.record.title);
    supervisorMap.set(name, entry);
  }
  const supervisors = [...supervisorMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  const uniMap = new Map();
  for (const i of theses) {
    const name = recordUniversity(i.record);
    if (!name) continue;
    uniMap.set(name, (uniMap.get(name) || 0) + 1);
  }
  const universities = [...uniMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const mostCited = related
    .filter((i) => Number(i.record.citationCount) > 0)
    .sort((a, b) => b.record.citationCount - a.record.citationCount)
    .slice(0, 3);

  // Which of the student's own words are rare in the related work, and which other words keep appearing
  const topicStems = new Set(keywords.map((k) => k.stem));
  const coverage = new Map(keywords.map((k) => [k.stem, 0]));
  const otherTerms = new Map();
  for (const i of related) {
    const body = stemSet(`${i.record.title || ''} ${i.record.abstract || ''}`);
    for (const k of keywords) if (body.has(k.stem)) coverage.set(k.stem, coverage.get(k.stem) + 1);
    for (const k of extractKeywords(i.record.title)) {
      if (topicStems.has(k.stem)) continue;
      const entry = otherTerms.get(k.stem) || { word: k.word, count: 0 };
      entry.count += 1;
      otherTerms.set(k.stem, entry);
    }
  }
  const enoughToCompare = related.length >= 5;
  const rareTerms = enoughToCompare
    ? keywords.filter((k) => coverage.get(k.stem) / related.length < 0.2).map((k) => k.word)
    : [];
  const commonTerms = enoughToCompare
    ? [...otherTerms.values()]
        .filter((t) => t.count >= 3 && t.count / related.length >= 0.2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
    : [];

  const verdictIndex = pickVerdict(close.length, related.length);

  return {
    topic: String(topic || '').trim(),
    keywords: keywords.map((k) => k.word),
    tooBroad: keywords.length < 3,
    checkedCount: items.length,
    items,
    close,
    related,
    recentCount,
    yearSeries,
    earlier,
    theses,
    localTheses,
    bangladeshTheses,
    sameUniversity,
    supervisors,
    universities,
    mostCited,
    rareTerms,
    commonTerms,
    datasets: Array.isArray(datasets) ? datasets.slice(0, 5) : [],
    verdictIndex,
    verdict: VERDICTS[verdictIndex],
    currentYear,
  };
}

// Plain-text version a student can paste into a proposal draft or send to a supervisor
export function buildBriefText(report, appName = 'The Thesis Archive') {
  if (!report) return '';
  const lines = [];
  lines.push(`TOPIC CHECK: ${report.topic}`);
  lines.push(`Result: ${report.verdict.label} - ${report.verdict.headline}`);
  lines.push(
    `Checked ${report.checkedCount} results: ${report.close.length} close match(es), ${report.related.length} related, ${report.recentCount} from the last 3 years, ${report.theses.length} related theses.`
  );
  lines.push('');
  if (report.related.length) {
    lines.push('Closest existing work:');
    report.related.slice(0, 8).forEach((i, n) => {
      const r = i.record;
      const where = [recordAuthor(r), r.publishedYear, isThesisRecord(r) ? recordUniversity(r) : r.venue || r.publisher]
        .filter(Boolean)
        .join(', ');
      lines.push(`${n + 1}. ${r.title}${where ? ` (${where})` : ''}${r.doi ? ` https://doi.org/${r.doi}` : ''}`);
    });
    lines.push('');
  }
  if (report.rareTerms.length) {
    lines.push(`Parts of this idea that rarely appear in the related work: ${report.rareTerms.join(', ')}`);
  }
  if (report.commonTerms.length) {
    lines.push(`Terms the related work keeps using: ${report.commonTerms.map((t) => t.word).join(', ')}`);
  }
  if (report.supervisors.length) {
    lines.push(`Supervisors of related theses: ${report.supervisors.map((s) => `${s.name} (${s.count})`).join(', ')}`);
  }
  if (report.datasets.length) {
    lines.push('');
    lines.push('Datasets that may be usable:');
    report.datasets.forEach((d) => lines.push(`- ${d.title}${d.doi ? ` https://doi.org/${d.doi}` : d.url ? ` ${d.url}` : ''}`));
  }
  lines.push('');
  lines.push(
    `Note: based on the top results returned by the sources searched on ${new Date().toISOString().slice(0, 10)}. It shows what was found, not proof that nothing else exists.`
  );
  lines.push(`Generated with ${appName}.`);
  return lines.join('\n');
}
