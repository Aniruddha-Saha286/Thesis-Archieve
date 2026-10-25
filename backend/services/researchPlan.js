const DEFAULT_TASKS = [
  ['question', 'Frame my research question'], ['literature', 'Map the related literature'],
  ['method', 'Choose a method and data source'], ['experiment', 'Run the study or experiments'],
  ['analysis', 'Analyze the findings'], ['writing', 'Write, review and revise'],
];
function initialPlan() {
  return { title: '', goal: '', targetDate: '', tasks: DEFAULT_TASKS.map(([id, title]) => ({ id, title, done: false })), version: 0, updatedAt: null };
}
function validatePlan(body) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('A research plan is required.');
  if (!Number.isSafeInteger(body.version) || body.version < 0 || body.version > 1000000000) fail('Refresh the roadmap before saving.');
  const text = (value, max, label) => {
    if (typeof value !== 'string' || value.length > max) fail(`${label} must be text of at most ${max} characters.`);
    return value.trim();
  };
  const title = text(body.title, 180, 'Working title'), goal = text(body.goal, 1200, 'Research goal');
  const targetDate = text(body.targetDate, 10, 'Target date');
  if (targetDate && (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(Date.parse(targetDate)) || new Date(targetDate).toISOString().slice(0, 10) !== targetDate)) fail('Choose a valid target date.');
  if (!Array.isArray(body.tasks) || body.tasks.length > 24) fail('Keep your roadmap to at most 24 milestones.');
  const ids = new Set();
  const tasks = body.tasks.map(task => {
    if (!task || typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(task.id) || ids.has(task.id)) fail('Each milestone needs a unique ID.');
    ids.add(task.id);
    const taskTitle = text(task.title, 120, 'Milestone');
    if (!taskTitle || typeof task.done !== 'boolean') fail('Give every milestone a title and completion state.');
    return { id: task.id, title: taskTitle, done: task.done };
  });
  return { title, goal, targetDate, tasks, version: body.version };
}
module.exports = { initialPlan, validatePlan };
