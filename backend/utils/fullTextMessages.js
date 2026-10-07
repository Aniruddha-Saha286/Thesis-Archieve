const FULL_TEXT_MESSAGES = {
  no_pdf: 'No free PDF is known for this paper, so only the abstract can be used.',
  reader_not_installed: 'Reading PDFs is not switched on for this site yet.',
  invalid_url: 'The PDF link for this paper is not a usable web address.',
  blocked_host: 'The PDF link for this paper points to an address this site does not open.',
  too_many_redirects: 'The PDF link kept redirecting and could not be opened.',
  too_large: 'This PDF is too large to read here. Open it from the paper page instead.',
  not_pdf: 'The link did not return a PDF. The publisher may show a sign-in or download page first.',
  timeout: 'The PDF took too long to open. Try again in a moment.',
  network: 'The site hosting this PDF could not be reached. Try again in a moment.',
  encrypted: 'This PDF is password-protected and cannot be read here.',
  unreadable: 'This PDF could not be read. The file may be damaged.',
  no_text_layer: 'This PDF is a scan (pictures of pages), so its text cannot be read here.',
  busy: 'Other PDFs are being read right now. Try again in a few seconds.',
};

function fullTextMessage(reason) {
  const key = String(reason || '');
  if (FULL_TEXT_MESSAGES[key]) return FULL_TEXT_MESSAGES[key];
  if (/^http_\d{3}$/.test(key)) {
    const status = key.slice(5);
    if (status === '401' || status === '403') return 'The site hosting this PDF does not allow it to be opened from here.';
    if (status === '404' || status === '410') return 'The PDF link for this paper no longer works.';
    if (status === '429') return 'The site hosting this PDF is limiting requests. Try again later.';
    return 'The site hosting this PDF returned an error. Try again later.';
  }
  return 'The full text could not be read for this paper.';
}

function isRetryableFullTextReason(reason) {
  const key = String(reason || '');
  return key === 'timeout' || key === 'network' || key === 'busy' || key === 'http_429' || /^http_5\d\d$/.test(key);
}

module.exports = { FULL_TEXT_MESSAGES, fullTextMessage, isRetryableFullTextReason };
