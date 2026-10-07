function escapeRegex(text) {
  return String(text == null ? '' : text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
