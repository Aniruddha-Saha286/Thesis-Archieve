export function readingSummary(papers = []) {
  return papers.reduce((summary, paper) => {
    const status = ['To read', 'Reading', 'Reviewed', 'To cite'].includes(paper.readingStatus) ? paper.readingStatus : 'To read';
    summary[status]++; return summary;
  }, { 'To read': 0, Reading: 0, Reviewed: 0, 'To cite': 0 });
}
export function supervisorBrief(plan, papers = [], now = new Date()) {
  const tasks = plan.tasks || [], completed = tasks.filter(task => task.done).length;
  const summary = readingSummary(papers);
  const next = tasks.find(task => !task.done);
  return [
    'THESIS PROGRESS BRIEF', `Prepared: ${now.toLocaleDateString()}`, '',
    `Working title: ${plan.title || 'Not set'}`, `Research goal: ${plan.goal || 'Not set'}`,
    `Target date: ${plan.targetDate || 'Not set'}`, '',
    `ROADMAP — ${completed} of ${tasks.length} milestones complete`,
    ...tasks.map(task => `[${task.done ? 'x' : ' '}] ${task.title}`), '',
    `Next milestone: ${next?.title || (tasks.length ? 'All planned milestones complete; review your next steps.' : 'Add your first milestone.')}`, '',
    `READING PROGRESS — ${papers.length} saved papers`,
    `To read: ${summary['To read']} | Reading: ${summary.Reading} | Reviewed: ${summary.Reviewed} | To cite: ${summary['To cite']}`, '',
    'CURRENT READING',
    ...papers.filter(paper => paper.readingStatus === 'Reading').slice(0, 10).map(paper => `- ${paper.title}${paper.doi ? ` (DOI: ${paper.doi})` : ''}`), '',
    'This brief contains your recorded progress, not an assessment of research quality or originality.',
  ].join('\n');
}
export function searchAngles(topic) {
  const query = String(topic || '').trim().slice(0, 120);
  if (!query) return [];
  return [
    { id: 'review', label: 'Map the field', query: `${query} systematic review`, detail: 'Start with reviews to learn the language and scope.' },
    { id: 'method', label: 'Find a method', query: `${query} methodology evaluation`, detail: 'Explore how researchers designed and evaluated their studies.' },
    { id: 'data', label: 'Look for evidence', query: `${query} dataset benchmark`, detail: 'Look for datasets and evaluation benchmarks.' },
  ];
}
