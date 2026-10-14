const { safeLink } = require('./resourceLinks');
function text(value) { return typeof value === 'string' ? value.slice(0, 20000) : ''; }
function matrixRow(paper, analysis, overrides = {}) {
  const notes = paper.structuredNotes || {};
  const summary = analysis?.summary || {};
  const choose = (...values) => values.map(text).find(v => v.trim()) || 'Not extracted';
  return {
    title: text(paper.title), authors: text(paper.authors || paper.author), year: paper.year || paper.publishedYear || '',
    doi: text(paper.doi), source: safeLink(paper.doi ? `https://doi.org/${paper.doi}` : paper.pdfUrl),
    objective: choose(notes.researchQuestion, summary.researchObjective, summary.researchQuestion),
    methodology: choose(overrides.methodology, notes.method, summary.methodology, summary.studyDesignAndMethods),
    dataset: choose(overrides.dataset, notes.dataset, summary.datasetSample, summary.dataOrSample),
    findings: choose(overrides.findings, notes.findings, summary.mainFindings, summary.keyFindings),
    limitations: choose(overrides.limitations, notes.limitations, summary.authorStatedLimitations, summary.limitations),
    futureWork: choose(summary.futureWork), relevance: choose(notes.relevanceToMyThesis), notes: text(paper.notes),
    coverage: analysis?.coverage || 'No cached analysis',
    analysisType: summary.isAiGenerated ? 'AI analysis — verify evidence' : analysis ? 'Extracted from paper' : 'Personal notes only',
    evidence: (summary.evidence || []).map(e => `${text(e.field || e.section)}: ${text(e.quote || e.text)} (${text(e.sectionOrPage || e.source)})`).join('\n'),
    provenance: JSON.stringify({ personalFields: Object.keys(notes).filter(k => notes[k]), editedFields: Object.keys(overrides).filter(k => overrides[k]), analysisDate: analysis?.generatedAt || null }),
  };
}
function publicCollection(collection, savedPapers) {
  const ids = new Set((collection.paperIds || []).map(String));
  return {
    name: text(collection.name), description: text(collection.description),
    papers: savedPapers.filter(p => ids.has(String(p.paperId))).map(p => ({
      title: text(p.title), authors: text(p.authors), year: p.year, doi: text(p.doi),
      url: safeLink(p.doi ? `https://doi.org/${p.doi}` : p.pdfUrl), publicationType: text(p.publicationType),
    })),
  };
}
module.exports = { matrixRow, publicCollection };
