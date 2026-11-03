// Reject operators supplied as field names before request data reaches database queries.
// Values remain untouched so research text can legitimately contain dollar signs.
function containsOperator(input) {
  const pending = [input];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value)) {
      if (key.startsWith('$')) return true;
      if (child && typeof child === 'object') pending.push(child);
    }
  }
  return false;
}

module.exports = function rejectMongoOperators(req, res, next) {
  if (containsOperator(req.body) || containsOperator(req.query)) {
    return res.status(400).json({ message: 'Invalid request field.' });
  }
  return next();
};
