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
    openAlexConceptIds: ['C38652104', 'C115903868'], // Computer security, Cryptography
  },
  {
    id: 'data-science',
    label: 'Data Science / Data Analytics',
    shortLabel: 'Data Science',
    description: 'Statistical modeling, big data architectures, data mining, predictive analytics, and visualization.',
    keywords: ['data science', 'data analytics', 'big data', 'data mining', 'predictive modeling', 'business intelligence'],
    openAlexConceptIds: ['C2522767166', 'C124101348'], // Data science, Data mining
  },
  {
    id: 'ai-ml',
    label: 'Artificial Intelligence and Machine Learning',
    shortLabel: 'AI & Machine Learning',
    description: 'Deep learning, reinforcement learning, neural networks, foundation models, and algorithmic reasoning.',
    keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'reinforcement learning'],
    openAlexConceptIds: ['C154945302', 'C119857082'], // Artificial intelligence, Machine learning
  },
  {
    id: 'nlp',
    label: 'Natural Language Processing',
    shortLabel: 'NLP',
    description: 'Computational linguistics, large language models, sentiment analysis, translation, and text generation.',
    keywords: ['natural language processing', 'nlp', 'large language model', 'computational linguistics', 'speech recognition', 'sentiment analysis'],
    openAlexConceptIds: ['C204321447'], // Natural language processing
  },
  {
    id: 'computer-vision',
    label: 'Computer Vision',
    shortLabel: 'Computer Vision',
    description: 'Object detection, image segmentation, facial recognition, generative vision models, and 3D reconstruction.',
    keywords: ['computer vision', 'image processing', 'object detection', 'segmentation', 'facial recognition', 'scene reconstruction'],
    openAlexConceptIds: ['C31972630'], // Computer vision
  },
  {
    id: 'software-engineering',
    label: 'Software Engineering',
    shortLabel: 'Software Engineering',
    description: 'Software architecture, automated testing, DevOps, refactoring, program synthesis, and verification.',
    keywords: ['software engineering', 'software architecture', 'refactoring', 'continuous integration', 'program synthesis', 'code quality'],
    openAlexConceptIds: ['C52917350'], // Software engineering
  },
  {
    id: 'networks-distributed',
    label: 'Computer Networks and Distributed Systems',
    shortLabel: 'Networks & Distributed',
    description: 'Distributed consensus, cloud computing, 5G/6G protocols, edge computing, and microservices.',
    keywords: ['distributed systems', 'computer networks', 'cloud computing', 'edge computing', 'consensus', 'microservices', 'tcp/ip'],
    openAlexConceptIds: ['C31258907', 'C120314980'], // Computer network, Distributed computing
  },
  {
    id: 'databases',
    label: 'Databases and Data Management',
    shortLabel: 'Databases',
    description: 'Relational query engines, NoSQL stores, vector indexing, distributed transactions, and data warehousing.',
    keywords: ['databases', 'database management', 'sql', 'nosql', 'vector database', 'query optimization', 'data warehouse'],
    openAlexConceptIds: ['C77088390', 'C199360897'], // Database, Data management
  },
  {
    id: 'hci',
    label: 'Human–Computer Interaction',
    shortLabel: 'HCI',
    description: 'User experience design, accessibility, interaction paradigms, usability evaluation, and augmented reality.',
    keywords: ['human-computer interaction', 'hci', 'user experience', 'interaction design', 'accessibility', 'usability'],
    openAlexConceptIds: ['C107457646'], // Human–computer interaction
  },
  {
    id: 'iot-embedded',
    label: 'Internet of Things and Embedded Systems',
    shortLabel: 'IoT & Embedded',
    description: 'Smart sensors, microcontroller firmware, edge telemetry, robotics hardware, and cyber-physical systems.',
    keywords: ['internet of things', 'iot', 'embedded systems', 'sensors', 'microcontroller', 'robotics', 'cyber-physical'],
    openAlexConceptIds: ['C108827148', 'C118552586'], // Internet of things, Embedded system
  },
  {
    id: 'renewable-energy',
    label: 'Renewable Energy & Materials',
    shortLabel: 'Renewable Energy',
    description: 'Photovoltaics, battery storage, grid modernization, sustainable materials, and bioenergy.',
    keywords: ['renewable energy', 'solar energy', 'battery storage', 'photovoltaic', 'wind power', 'materials science'],
    openAlexConceptIds: ['C143120270'], // Renewable energy
  },
  {
    id: 'biomedical',
    label: 'Biomedical & Clinical Science',
    shortLabel: 'Biomedical Science',
    description: 'Genomics, translational medicine, clinical diagnostics, epidemiology, and healthcare informatics.',
    keywords: ['biomedical', 'clinical science', 'medicine', 'genomics', 'epidemiology', 'healthcare informatics'],
    openAlexConceptIds: ['C71924100'], // Medicine
  },
  {
    id: 'agriculture',
    label: 'Agricultural Systems & Soil',
    shortLabel: 'Agricultural Science',
    description: 'Crop pathology, precision agriculture, soil microbiology, sustainable farming, and water conservation.',
    keywords: ['agriculture', 'soil science', 'crop pathology', 'precision farming', 'agronomy'],
    openAlexConceptIds: ['C144133560'], // Agriculture
  },
  {
    id: 'development-economics',
    label: 'Development Economics',
    shortLabel: 'Development Economics',
    description: 'Microfinance, poverty alleviation, trade policy, labor economics, and developing nation growth.',
    keywords: ['development economics', 'economics', 'microfinance', 'trade policy', 'poverty alleviation', 'labor market'],
    openAlexConceptIds: ['C162324750'], // Economics
  },
  {
    id: 'other',
    label: 'Other Disciplines / Unclassified',
    shortLabel: 'Other Disciplines',
    description: 'Interdisciplinary, humanities, general science, or unclassified scholarly manuscripts.',
    keywords: ['interdisciplinary', 'general science', 'humanities'],
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
    /\b(infosec|malware|ransomware|penetration testing|vulnerability|intrusion detection)\b/.test(str) ||
    /\b(computer|network|information|software)\s+security\b/.test(str)
  ) {
    return SUBJECTS_BY_ID.get('cybersecurity');
  }

  // Data Science
  if (str.includes('data science') || str.includes('data analytic') || str.includes('big data')) {
    return SUBJECTS_BY_ID.get('data-science');
  }

  // Software Engineering (Includes software development)
  if (
    str.includes('software engineering') ||
    str.includes('devops') ||
    str.includes('software architecture') ||
    str.includes('software development')
  ) {
    return SUBJECTS_BY_ID.get('software-engineering');
  }

  // Networks & Distributed Systems (Exclude neural, biological, or metabolic networks)
  const isBiologicalOrNeural = /\b(neural|metabolic|biological|gene regulatory|protein)\s+network\b/.test(str);
  if (
    !isBiologicalOrNeural &&
    (
      /\b(computer network|network protocol|telecommunication|cloud computing|distributed system|peer-to-peer|wireless sensor network|edge computing)\b/.test(str) ||
      (/\bnetwork(s|ing)?\b/.test(str) && /\b(routing|packet|topology|tcp|ip|lan|wan|sdn)\b/.test(str))
    )
  ) {
    return SUBJECTS_BY_ID.get('networks-distributed');
  }

  // Databases
  if (str.includes('database') || str.includes('sql') || str.includes('data management')) {
    return SUBJECTS_BY_ID.get('databases');
  }

  // HCI
  if (str.includes('human-computer') || str.includes('hci') || str.includes('user experience') || str.includes('user interface')) {
    return SUBJECTS_BY_ID.get('hci');
  }

  // IoT & Embedded
  if (str.includes('iot') || str.includes('internet of things') || str.includes('embedded system')) {
    return SUBJECTS_BY_ID.get('iot-embedded');
  }

  // Renewable Energy & Materials
  if (str.includes('renewable') || str.includes('solar energy') || str.includes('wind energy') || str.includes('clean energy') || str.includes('materials science')) {
    return SUBJECTS_BY_ID.get('renewable-energy');
  }

  // Biomedical & Health
  if (str.includes('biomedical') || str.includes('clinical') || str.includes('medicine') || str.includes('health informatics')) {
    return SUBJECTS_BY_ID.get('biomedical');
  }

  // Agriculture & Environment (Includes food security and agronomy)
  if (str.includes('agricult') || str.includes('soil') || str.includes('crop') || str.includes('food security') || str.includes('agronomy')) {
    return SUBJECTS_BY_ID.get('agriculture');
  }

  // Development Economics (Require economic context; exclude child, infant, software development)
  const isNonEconomicDev = /\b(child|infant|human cognitive|software|web|drug|product|career)\s+development\b/.test(str);
  if (
    !isNonEconomicDev &&
    (
      /\b(economic|economies|macroeconomic|microeconomic|econometrics)\b/.test(str) ||
      /\b(sustainable development|poverty alleviation|developing countries|economic growth|financial development)\b/.test(str)
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
function extractSubjectsFromOpenAlex(concepts = [], topics = []) {
  const result = [];
  const seenIds = new Set();

  const candidates = [];
  if (Array.isArray(topics)) {
    for (const t of topics) {
      if (t?.score !== undefined && t.score < 0.35) continue;
      if (t?.display_name) candidates.push(t.display_name);
      if (t?.subfield?.display_name) candidates.push(t.subfield.display_name);
      if (t?.field?.display_name) candidates.push(t.field.display_name);
    }
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
      if (result.length >= 3) break; // Keep top 3 for clean display
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
