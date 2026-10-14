const cheerio = require('cheerio');
const { getMetadata } = require('../discoveryHttp');
const { normalizeDiscovery } = require('../discoveryRecord');
const { safeLink } = require('../resourceLinks');
const value = x => x && typeof x === 'object' && 'value' in x ? x.value : x;
function mapOpenReview(note, job) {
  const c = note.content || {}, group = `${job.venueId === 'iclr' ? 'ICLR' : 'NeurIPS'}.cc/${job.year}/Conference`;
  if (value(c.venueid) !== group || !value(c.title) || note.ddate) return null;
  const link = 'https://openreview.net/forum?id=' + encodeURIComponent(note.id);
  const pdfPath = value(c.pdf);
  const pdf = typeof pdfPath === 'string' ? safeLink(new URL(pdfPath, 'https://openreview.net').href, ['openreview.net']) : null;
  const code = safeLink(value(c.code), ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org']);
  const dataset = safeLink(value(c.dataset));
  return normalizeDiscovery({ id: 'openreview_' + note.id, title: value(c.title), authors: value(c.authors), abstract: value(c.abstract), venue: job.venueId.toUpperCase(), publishedYear: job.year,
    publicationType: 'conference-paper', acceptanceStatus: 'accepted', isPeerReviewed: true,
    // cdate and mdate are submission/activity timestamps, not publication dates.
    datePrecision: 'year', pdfUrl: pdf, fullTextUrl: link, source: 'OpenReview', catalogId: note.id,
    doi: value(c.doi), codeUrl: code, datasetUrl: dataset, license: value(c.license),
    codeEvidence: code ? link : null, datasetEvidence: dataset ? link : null, publicationEvidence: link,
  });
}
function parseOfficialPaper(html, url, job) {
  const $ = cheerio.load(html);
  const meta = name => $(`meta[name="${name}"]`).first().attr('content')?.trim();
  const title = meta('citation_title'); if (!title) return null;
  const rawDate = meta('citation_publication_date') || meta('citation_date') || '';
  const date = /^\d{4}[/-]\d{2}[/-]\d{2}$/.test(rawDate) ? rawDate.replaceAll('/', '-') : null;
  const resource = label => $('a').toArray().find(a => $(a).text().trim().toLowerCase() === label);
  const href = a => a ? safeLink(new URL($(a).attr('href') || '', url).href) : null;
  const code = href(resource('code')); const dataset = href(resource('dataset'));
  const venue = meta('citation_journal_title') || meta('citation_conference_title');
  if (!venue) return null;
  return normalizeDiscovery({ id: 'official_' + Buffer.from(url).toString('base64url'), catalogId: url, title,
    authors: $('meta[name="citation_author"]').toArray().map(a => $(a).attr('content')),
    doi: meta('citation_doi'), abstract: $('#abstract').text().trim() || $('.abstract').text().trim() || null,
    venue, publishedYear: Number(rawDate.slice(0, 4)) || job.year, publicationDate: date, datePrecision: date ? 'day' : 'year',
    publicationType: job.venueId === 'jmlr' ? 'journal-article' : 'conference-paper', acceptanceStatus: 'published', isPeerReviewed: true,
    source: job.provider === 'jmlr' ? 'JMLR' : 'CVF', fullTextUrl: url, pdfUrl: meta('citation_pdf_url') ? safeLink(new URL(meta('citation_pdf_url'), url).href) : null,
    codeUrl: code, datasetUrl: dataset, codeEvidence: code ? url : null, datasetEvidence: dataset ? url : null, publicationEvidence: url,
  });
}
async function fetchOfficial(job, offset, limit) {
  if (job.provider === 'openreview') {
    const group = `${job.venueId === 'iclr' ? 'ICLR' : 'NeurIPS'}.cc/${job.year}/Conference`;
    const params = new URLSearchParams({ 'content.venueid': group, limit: String(limit), offset: String(offset), sort: 'id:asc' });
    const data = await getMetadata('https://api2.openreview.net/notes?' + params);
    if (!Array.isArray(data.notes)) throw new Error('Malformed OpenReview response');
    return { records: data.notes.map(n => mapOpenReview(n, job)).filter(Boolean), nextOffset: offset + data.notes.length, hasMore: offset + data.notes.length < Number(data.count || 0) };
  }
  const listing = job.provider === 'jmlr' ? `https://www.jmlr.org/papers/v${job.year - 1999}/` : `https://openaccess.thecvf.com/${job.venueId.toUpperCase()}${job.year}?day=all`;
  const { html } = await getMetadata(listing, 'html', 16 * 1024 * 1024); const $ = cheerio.load(html);
  const links = [...new Set($('a[href]').toArray().map(a => new URL($(a).attr('href'), listing).href).filter(url => job.provider === 'jmlr'
    ? new URL(url).hostname === 'www.jmlr.org' && new RegExp('/papers/v' + (job.year - 1999) + '/[^/]+\\.html$').test(new URL(url).pathname)
    : new URL(url).hostname === 'openaccess.thecvf.com' && new URL(url).pathname.startsWith(`/content/${job.venueId.toUpperCase()}${job.year}/html/`) && url.endsWith('.html')))];
  if (!links.length) throw new Error('Proceedings unavailable or metadata layout changed');
  const records = [];
  for (const url of links.slice(offset, offset + limit)) {
    const page = await getMetadata(url, 'html'); const record = parseOfficialPaper(page.html, url, job);
    if (!record) throw new Error('Missing citation metadata');
    records.push(record);
    await new Promise(r => setTimeout(r, 350));
  }
  return { records, nextOffset: offset + Math.min(limit, links.length - offset), hasMore: offset + limit < links.length };
}
module.exports = { mapOpenReview, parseOfficialPaper, fetchOfficial };
