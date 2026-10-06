// Makes user-typed text safe to place inside a RegExp.
// Without this, a search for "(" throws "Invalid regular expression" and the request fails.
function escapeRegex(text) {
  return String(text == null ? '' : text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
