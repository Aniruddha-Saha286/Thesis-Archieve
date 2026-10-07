
const net = require('net');

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254',
]);

function isPrivateIpOrHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const host = hostname.toLowerCase().trim();
  if (BLOCKED_HOSTS.has(host)) return true;
  if (net.isIP(host)) {
    return PRIVATE_IP_PATTERNS.some((pat) => pat.test(host));
  }
  return false;
}

function isValidHttpUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const parsed = new URL(urlString.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (isPrivateIpOrHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const TRUSTED_DATASET_DOMAINS = [
  'zenodo.org',
  'datacite.org',
  'figshare.com',
  'dryad.org',
  'datadryad.org',
  'kaggle.com',
  'huggingface.co',
  'github.com',
  'gitlab.com',
  'osf.io',
  'dataverse.harvard.edu',
  'mendeley.com',
  'archive.org',
  'pangaea.de',
  'ncbi.nlm.nih.gov',
  'ebi.ac.uk',
];

function isValidDatasetRepositoryUrl(urlString) {
  if (!isValidHttpUrl(urlString)) return false;
  try {
    const parsed = new URL(urlString.trim());
    const hostname = parsed.hostname.toLowerCase();
    const isTrusted = TRUSTED_DATASET_DOMAINS.some(
      (dom) => hostname === dom || hostname.endsWith(`.${dom}`)
    );
    const isAcademic =
      hostname.endsWith('.edu') ||
      hostname.includes('.ac.') ||
      hostname.includes('.gov') ||
      hostname.endsWith('.org');

    return isTrusted || isAcademic || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidCodeRepositoryUrl(urlString) {
  if (!isValidHttpUrl(urlString)) return false;
  try {
    const parsed = new URL(urlString.trim());
    const hostname = parsed.hostname.toLowerCase();
    const allowed = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'sourceforge.net'];
    return (
      allowed.some((dom) => hostname === dom || hostname.endsWith(`.${dom}`)) ||
      hostname.endsWith('.edu')
    );
  } catch {
    return false;
  }
}

function isValidDocumentUrl(urlString) {
  if (!isValidHttpUrl(urlString)) return false;
  try {
    const parsed = new URL(urlString.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}


function parseIpv4(text) {
  const parts = String(text).split('.');
  if (parts.length !== 4) return null;
  const bytes = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function isPublicIpv4Bytes(b) {
  const [a, c] = b;
  if (a === 0) return false;
  if (a === 10) return false;
  if (a === 100 && c >= 64 && c <= 127) return false;
  if (a === 127) return false;
  if (a === 169 && c === 254) return false;
  if (a === 172 && c >= 16 && c <= 31) return false;
  if (a === 192 && c === 0 && b[2] === 0) return false;
  if (a === 192 && c === 0 && b[2] === 2) return false;
  if (a === 192 && c === 88 && b[2] === 99) return false;
  if (a === 192 && c === 168) return false;
  if (a === 198 && (c === 18 || c === 19)) return false;
  if (a === 198 && c === 51 && b[2] === 100) return false;
  if (a === 203 && c === 0 && b[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

function parseIpv6(text) {
  let address = String(text).split('%')[0];
  if (address.includes('.')) {
    const cut = address.lastIndexOf(':');
    const v4 = parseIpv4(address.slice(cut + 1));
    if (!v4) return null;
    address = `${address.slice(0, cut + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  const bytes = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function isPublicIpAddress(address) {
  if (!address || typeof address !== 'string') return false;
  const text = address.trim().replace(/^\[|\]$/g, '');
  const family = net.isIP(text.split('%')[0]);
  if (family === 4) {
    const bytes = parseIpv4(text);
    return Boolean(bytes) && isPublicIpv4Bytes(bytes);
  }
  if (family !== 6) return false;

  const b = parseIpv6(text);
  if (!b || b.length !== 16) return false;
  const firstTwelveZero = b.slice(0, 12).every((byte) => byte === 0);
  const firstTenZero = b.slice(0, 10).every((byte) => byte === 0);

  if (firstTwelveZero) return false;
  if (firstTenZero && b[10] === 0xff && b[11] === 0xff) return isPublicIpv4Bytes(b.slice(12));
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return b.slice(4, 12).every((byte) => byte === 0) && isPublicIpv4Bytes(b.slice(12));
  }
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicIpv4Bytes(b.slice(2, 6));
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return false;
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false;
  return (b[0] & 0xe0) === 0x20;
}

module.exports = {
  isPrivateIpOrHost,
  isValidHttpUrl,
  isValidDatasetRepositoryUrl,
  isValidCodeRepositoryUrl,
  isValidDocumentUrl,
  isPublicIpAddress,
};
