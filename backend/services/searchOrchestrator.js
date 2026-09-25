const { executeSearchSession } = require('./searchSessionManager');

async function orchestrateScholarlySearch({
  query = '',
  page = 1,
  limit = 20,
  filters = {},
  sort = 'relevance',
  sessionId = null,
  scope = null,
}) {
  return executeSearchSession({
    query,
    page,
    limit,
    filters,
    sort,
    explicitSessionId: sessionId,
    scope,
  });
}

module.exports = {
  orchestrateScholarlySearch,
};
