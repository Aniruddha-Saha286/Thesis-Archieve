/**
 * Shared Subject Catalog for Project Panther / The Thesis Archive
 * Single source of truth for academic disciplines, mappings to OpenAlex concepts,
 * and search filter tokens.
 */

const SUBJECT_CATALOG = [
  {
    id: 'cybersecurity',
    label: 'Cybersecurity / Information Security',
    shortLabel: 'Cybersecurity',
    description: 'Cryptography, network defense, vulnerability assessment, threat intelligence, and zero-trust systems.',
    keywords: ['cybersecurity', 'information security', 'cryptography', 'malware', 'network security', 'penetration testing', 'zero trust'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10400', 'T10734', 'T13983', 'T10237', 'T10951', 'T12221', 'T11130'],
    openAlexConceptIds: ['C38652104', 'C115903868'], // Computer security, Cryptography
  },
  {
    id: 'data-science',
    label: 'Data Science / Data Analytics',
    shortLabel: 'Data Science',
    description: 'Statistical modeling, big data architectures, data mining, predictive analytics, and visualization.',
    keywords: ['data science', 'data analytics', 'big data', 'data mining', 'predictive modeling', 'business intelligence'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10538', 'T10799', 'T11891', 'T12016', 'T13373', 'T14435'],
    openAlexConceptIds: ['C2522767166', 'C124101348'], // Data science, Data mining
  },
  {
    id: 'ai-ml',
    label: 'Artificial Intelligence and Machine Learning',
    shortLabel: 'AI & Machine Learning',
    description: 'Deep learning, reinforcement learning, neural networks, foundation models, and algorithmic reasoning.',
    keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'reinforcement learning'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T12072', 'T10320', 'T12535', 'T10462', 'T12026', 'T10028'],
    openAlexConceptIds: ['C154945302', 'C119857082'], // Artificial intelligence, Machine learning
  },
  {
    id: 'nlp',
    label: 'Natural Language Processing',
    shortLabel: 'NLP',
    description: 'Computational linguistics, large language models, sentiment analysis, translation, and text generation.',
    keywords: ['natural language processing', 'nlp', 'large language model', 'computational linguistics', 'speech recognition', 'sentiment analysis'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10181', 'T11550', 'T12262', 'T13910'],
    openAlexConceptIds: ['C204321447'], // Natural language processing
  },
  {
    id: 'computer-vision',
    label: 'Computer Vision',
    shortLabel: 'Computer Vision',
    description: 'Object detection, image segmentation, facial recognition, generative vision models, and 3D reconstruction.',
    keywords: ['computer vision', 'image processing', 'object detection', 'segmentation', 'facial recognition', 'scene reconstruction'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10036', 'T10052', 'T11605', 'T10057', 'T10331'],
    openAlexConceptIds: ['C31972630'], // Computer vision
  },
  {
    id: 'software-engineering',
    label: 'Software Engineering',
    shortLabel: 'Software Engineering',
    description: 'Software architecture, automated testing, DevOps, refactoring, program synthesis, and verification.',
    keywords: ['software engineering', 'software architecture', 'refactoring', 'continuous integration', 'program synthesis', 'code quality'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10260', 'T10430', 'T10639', 'T11450'],
    openAlexConceptIds: ['C52917350'], // Software engineering
  },
  {
    id: 'networks-distributed',
    label: 'Computer Networks and Distributed Systems',
    shortLabel: 'Networks & Distributed',
    description: 'Distributed consensus, cloud computing, 5G/6G protocols, edge computing, and microservices.',
    keywords: ['distributed systems', 'computer networks', 'cloud computing', 'edge computing', 'consensus', 'microservices', 'tcp/ip'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10772', 'T10715', 'T10101', 'T10249'],
    openAlexConceptIds: ['C31258907', 'C120314980'], // Computer network, Distributed computing
  },
  {
    id: 'databases',
    label: 'Databases and Data Management',
    shortLabel: 'Databases',
    description: 'Relational query engines, NoSQL stores, vector indexing, distributed transactions, and data warehousing.',
    keywords: ['databases', 'database management', 'sql', 'nosql', 'vector database', 'query optimization', 'data warehouse'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10317', 'T11106'],
    openAlexConceptIds: ['C77088390', 'C199360897'], // Database, Data management
  },
  {
    id: 'hci',
    label: 'Human–Computer Interaction',
    shortLabel: 'HCI',
    description: 'User experience design, accessibility, interaction paradigms, usability evaluation, and augmented reality.',
    keywords: ['human-computer interaction', 'hci', 'user experience', 'interaction design', 'accessibility', 'usability'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T10470', 'T11398', 'T11707', 'T10789', 'T10803'],
    openAlexConceptIds: ['C107457646'], // Human–computer interaction
  },
  {
    id: 'iot-embedded',
    label: 'Internet of Things and Embedded Systems',
    shortLabel: 'IoT & Embedded',
    description: 'Smart sensors, microcontroller firmware, edge telemetry, robotics hardware, and cyber-physical systems.',
    keywords: ['internet of things', 'iot', 'embedded systems', 'sensors', 'microcontroller', 'robotics', 'cyber-physical'],
    openAlexFieldId: '17',
    openAlexTopicIds: ['T13038', 'T10273', 'T10904', 'T12941', 'T13420'],
    openAlexConceptIds: ['C108827148', 'C118552586'], // Internet of things, Embedded system
  },
  {
    id: 'renewable-energy',
    label: 'Renewable Energy & Materials',
    shortLabel: 'Renewable Energy',
    description: 'Photovoltaics, battery storage, grid modernization, sustainable materials, and bioenergy.',
    keywords: ['renewable energy', 'solar energy', 'battery storage', 'photovoltaic', 'wind power', 'materials science'],
    openAlexFieldId: '21',
    openAlexTopicIds: ['T11007', 'T14444', 'T10624', 'T10018', 'T10281'],
    openAlexConceptIds: ['C143120270'], // Renewable energy
  },
  {
    id: 'biomedical',
    label: 'Biomedical & Clinical Science',
    shortLabel: 'Biomedical Science',
    description: 'Genomics, translational medicine, clinical diagnostics, epidemiology, and healthcare informatics.',
    keywords: ['biomedical', 'clinical science', 'medicine', 'genomics', 'epidemiology', 'healthcare informatics'],
    openAlexFieldId: '27',
    openAlexTopicIds: ['T11287', 'T10887', 'T10417', 'T10015', 'T10041', 'T10129'],
    openAlexConceptIds: ['C71924100'], // Medicine
  },
  {
    id: 'agriculture',
    label: 'Agricultural Systems & Soil',
    shortLabel: 'Agricultural Science',
    description: 'Crop pathology, precision agriculture, soil microbiology, sustainable farming, and water conservation.',
    keywords: ['agriculture', 'soil science', 'crop pathology', 'precision farming', 'agronomy'],
    openAlexFieldId: '11',
    openAlexTopicIds: ['T12310', 'T10004', 'T12792', 'T10616', 'T10439', 'T12294'],
    openAlexConceptIds: ['C144133560'], // Agriculture
  },
  {
    id: 'development-economics',
    label: 'Development Economics',
    shortLabel: 'Development Economics',
    description: 'Microfinance, poverty alleviation, trade policy, labor economics, and developing nation growth.',
    keywords: ['development economics', 'economics', 'microfinance', 'trade policy', 'poverty alleviation', 'labor market'],
    openAlexFieldId: '20',
    openAlexTopicIds: ['T10393', 'T13867', 'T12786', 'T12446'],
    openAlexConceptIds: ['C162324750'], // Economics
  },
  {
    id: 'other',
    label: 'Other Disciplines / Unclassified',
    shortLabel: 'Other Disciplines',
    description: 'Interdisciplinary, humanities, general science, or unclassified scholarly manuscripts.',
    keywords: ['interdisciplinary', 'general science', 'humanities'],
    openAlexFieldId: null,
    openAlexTopicIds: [],
    openAlexConceptIds: [],
  },
];

// Quick index maps
const SUBJECTS_BY_ID = new Map(SUBJECT_CATALOG.map((s) => [s.id, s]));
const SUBJECTS_BY_LABEL = new Map(SUBJECT_CATALOG.map((s) => [s.label.toLowerCase(), s]));

function getAllSubjects() {
  return [...SUBJECT_CATALOG];
}

function getSubjectById(id) {
  if (!id) return null;
  return SUBJECTS_BY_ID.get(id.toLowerCase()) || null;
}

/**
 * Maps a concept, category name, or raw text to a canonical subject entry.
 */
function mapToCanonicalSubject(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();

  // 1. Direct ID match
  if (SUBJECTS_BY_ID.has(str)) {
    return SUBJECTS_BY_ID.get(str);
  }

  // 2. Direct label match
  if (SUBJECTS_BY_LABEL.has(str)) {
    return SUBJECTS_BY_LABEL.get(str);
  }

  // 2.5 arXiv and taxonomic category code mappings
  if (str === 'cs.cr' || str.startsWith('cs.cr')) return SUBJECTS_BY_ID.get('cybersecurity');
  if (str === 'cs.ai' || str === 'cs.lg' || str === 'stat.ml' || str.startsWith('cs.ai') || str.startsWith('cs.lg') || str.startsWith('stat.ml')) return SUBJECTS_BY_ID.get('ai-ml');
  if (str === 'cs.cv' || str.startsWith('cs.cv')) return SUBJECTS_BY_ID.get('computer-vision');
  if (str === 'cs.cl' || str.startsWith('cs.cl')) return SUBJECTS_BY_ID.get('nlp');
  if (str === 'cs.se' || str.startsWith('cs.se')) return SUBJECTS_BY_ID.get('software-engineering');
  if (str === 'cs.ni' || str === 'cs.dc' || str.startsWith('cs.ni') || str.startsWith('cs.dc')) return SUBJECTS_BY_ID.get('networks-distributed');
  if (str === 'cs.db' || str.startsWith('cs.db')) return SUBJECTS_BY_ID.get('databases');
  if (str === 'cs.hc' || str.startsWith('cs.hc')) return SUBJECTS_BY_ID.get('hci');
  if (str === 'cs.ro' || str === 'cs.ar' || str === 'cs.sy' || str === 'eess.sp' || str.startsWith('cs.ro')) return SUBJECTS_BY_ID.get('iot-embedded');
  if (str.startsWith('q-bio')) return SUBJECTS_BY_ID.get('biomedical');
  if (str.startsWith('econ') || str.startsWith('q-fin')) return SUBJECTS_BY_ID.get('development-economics');

  // 3. Legacy category bridges and disambiguation
  if (str.includes('computer science') && (str.includes('nlp') || str.includes('natural language'))) {
    return SUBJECTS_BY_ID.get('nlp');
  }

  // AI / Machine Learning (Check before generic networks or computer vision)
  if (
    str.includes('artificial intelligence') ||
    str.includes('machine learning') ||
    str.includes('neural network') ||
    str.includes('deep learning') ||
    str.includes('reinforcement learning') ||
    str === 'ai/ml'
  ) {
    return SUBJECTS_BY_ID.get('ai-ml');
  }

  // Computer Vision
  if (str.includes('computer vision') || str.includes('image recognition') || str.includes('object detection') || str.includes('pattern recognition')) {
    return SUBJECTS_BY_ID.get('computer-vision');
  }

  // Cybersecurity (Require cyber, crypto, or explicit cyber/infosec terms; never food/social/job security)
  if (
    str.includes('cyber') ||
    str.includes('crypt') ||
    /\b(infosec|malware|ransomware|penetration testing|vulnerability|vulnerabilities|intrusion detection|zero trust|threat intelligence|phishing|firewall|exploit|access control|authentication)\b/i.test(str) ||
    /\b(computer|network|information|software|system|data|cloud|iot|web)\s+security\b/i.test(str) ||
    /\bsecurity\s+(information|protocol|protocols|measure|measures|threat|threats|incident|incidents|policy|policies|framework|frameworks|assessment|evaluation|management|audit)\b/i.test(str)
  ) {
    return SUBJECTS_BY_ID.get('cybersecurity');
  }

  // Data Science
  if (
    str.includes('data science') ||
    str.includes('data analytic') ||
    str.includes('big data') ||
    str.includes('data mining') ||
    str.includes('data visualization') ||
    str.includes('business intelligence') ||
    /\bdata\s+(analytics?|mining|science|visualization)\b/.test(str)
  ) {
    return SUBJECTS_BY_ID.get('data-science');
  }

  // Software Engineering (Includes software development)
  if (
    str.includes('software engineering') ||
    str.includes('devops') ||
    str.includes('software architecture') ||
    str.includes('software development') ||
    str.includes('software testing') ||
    str.includes('refactoring')
  ) {
    return SUBJECTS_BY_ID.get('software-engineering');
  }

  // Networks & Distributed Systems (Exclude neural, biological, or metabolic networks)
  const isBiologicalOrNeural = /\b(neural|metabolic|biological|gene regulatory|protein)\s+network\b/.test(str);
  if (
    !isBiologicalOrNeural &&
    (
      /\b(computer network|network protocol|telecommunication|cloud computing|distributed system|peer-to-peer|wireless sensor network|edge computing|distributed and parallel)\b/.test(str) ||
      (/\bnetwork(s|ing)?\b/.test(str) && /\b(routing|packet|topology|tcp|ip|lan|wan|sdn)\b/.test(str)) ||
      str.includes('cloud computing and resource management') ||
      str.includes('distributed systems and fault tolerance')
    )
  ) {
    return SUBJECTS_BY_ID.get('networks-distributed');
  }

  // Databases
  if (
    str.includes('database') ||
    str.includes('sql') ||
    str.includes('data management') ||
    str.includes('query optimization') ||
    str.includes('query engine')
  ) {
    return SUBJECTS_BY_ID.get('databases');
  }

  // HCI
  if (
    str.includes('human-computer') ||
    str.includes('hci') ||
    str.includes('user experience') ||
    str.includes('user interface') ||
    str.includes('usability') ||
    str.includes('human-technology') ||
    str.includes('assistive technology') ||
    str.includes('gesture recognition') ||
    str.includes('immersive displays')
  ) {
    return SUBJECTS_BY_ID.get('hci');
  }

  // IoT & Embedded
  if (
    str.includes('iot') ||
    str.includes('internet of things') ||
    str.includes('embedded system') ||
    str.includes('arduino') ||
    str.includes('microcontroller') ||
    str.includes('fpga') ||
    str.includes('cyber-physical')
  ) {
    return SUBJECTS_BY_ID.get('iot-embedded');
  }

  // Renewable Energy & Materials
  if (
    str.includes('renewable') ||
    str.includes('solar energy') ||
    str.includes('wind energy') ||
    str.includes('clean energy') ||
    str.includes('materials science') ||
    str.includes('photovoltaic') ||
    str.includes('solar cell') ||
    str.includes('battery material') ||
    str.includes('energy storage') ||
    str.includes('power systems and renewable')
  ) {
    return SUBJECTS_BY_ID.get('renewable-energy');
  }

  // Biomedical & Health
  if (
    str.includes('biomedical') ||
    str.includes('clinical') ||
    str.includes('medicine') ||
    str.includes('health informatics') ||
    str.includes('genomics') ||
    str.includes('oncology') ||
    str.includes('cancer') ||
    str.includes('glioma') ||
    str.includes('covid-19') ||
    str.includes('pathology') ||
    str.includes('therapeutics')
  ) {
    return SUBJECTS_BY_ID.get('biomedical');
  }

  // Agriculture & Environment (Includes food security and agronomy)
  if (
    str.includes('agricult') ||
    str.includes('soil') ||
    str.includes('crop') ||
    str.includes('food security') ||
    str.includes('agronomy') ||
    str.includes('fertilization') ||
    str.includes('farming')
  ) {
    return SUBJECTS_BY_ID.get('agriculture');
  }

  // Development Economics (Require economic context; exclude child, infant, software development)
  const isNonEconomicDev = /\b(child|infant|human cognitive|software|web|drug|product|career)\s+development\b/.test(str);
  if (
    !isNonEconomicDev &&
    (
      /\b(economic|economies|macroeconomic|microeconomic|econometrics|socioeconomic)\b/.test(str) ||
      /\b(sustainable development|poverty alleviation|developing countries|economic growth|financial development|fiscal polic)\b/.test(str)
    )
  ) {
    return SUBJECTS_BY_ID.get('development-economics');
  }

  // 4. Keyword scan with word boundary check
  for (const subject of SUBJECT_CATALOG) {
    for (const kw of subject.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\s|[^a-zA-Z0-9])${escaped}($|\\s|[^a-zA-Z0-9])`, 'i');
      if (regex.test(str)) {
        return subject;
      }
    }
  }

  return SUBJECTS_BY_ID.get('other');
}

/**
 * Extracts canonical subject entries from OpenAlex concepts or topics
 */
function extractSubjectsFromOpenAlex(concepts = [], topics = [], targetSubjectId = null) {
  const result = [];
  const seenIds = new Set();

  const candidates = [];
  if (typeof topics === 'string' && topics.trim()) {
    candidates.push(topics.trim());
  } else if (Array.isArray(topics)) {
    for (const t of topics) {
      if (typeof t === 'string' && t.trim()) {
        candidates.push(t.trim());
        continue;
      }
      if (t?.score !== undefined && t.score < 0.35) continue;
      if (t?.display_name) candidates.push(t.display_name);
      if (t?.subfield?.display_name) candidates.push(t.subfield.display_name);
      if (t?.field?.display_name) candidates.push(t.field.display_name);
    }
  } else if (topics && typeof topics === 'object') {
    if (topics.display_name) candidates.push(topics.display_name);
    if (topics.subfield?.display_name) candidates.push(topics.subfield.display_name);
    if (topics.field?.display_name) candidates.push(topics.field.display_name);
  }

  if (Array.isArray(concepts)) {
    for (const c of concepts) {
      if (c?.score !== undefined && c.score < 0.35) continue;
      if (c?.display_name) candidates.push(c.display_name);
    }
  }

  for (const cand of candidates) {
    const subject = mapToCanonicalSubject(cand);
    if (subject && subject.id !== 'other' && !seenIds.has(subject.id)) {
      seenIds.add(subject.id);
      result.push({
        id: subject.id,
        label: subject.label,
        shortLabel: subject.shortLabel,
        provenance: 'openalex_predicted',
        matchedTerm: cand,
      });
      if (result.length >= 5) break; // Allow up to 5 subjects for complete indexing
    }
  }

  // Prioritize targetSubjectId at index 0 if matched
  if (targetSubjectId && seenIds.has(targetSubjectId)) {
    const idx = result.findIndex((s) => s.id === targetSubjectId);
    if (idx > 0) {
      const [matchedSub] = result.splice(idx, 1);
      result.unshift(matchedSub);
    }
  } else if (targetSubjectId && result.length === 0) {
    // If no candidate directly mapped but targetSubject was matched at provider level, check keyword match on candidate strings
    const targetObj = getSubjectById(targetSubjectId);
    if (targetObj && candidates.some((c) => targetObj.keywords.some((kw) => c.toLowerCase().includes(kw.toLowerCase())))) {
      result.unshift({
        id: targetObj.id,
        label: targetObj.label,
        shortLabel: targetObj.shortLabel,
        provenance: 'openalex_predicted',
        matchedTerm: targetObj.keywords[0],
      });
    }
  }

  return result;
}

module.exports = {
  SUBJECT_CATALOG,
  getAllSubjects,
  getSubjectById,
  mapToCanonicalSubject,
  extractSubjectsFromOpenAlex,
};
