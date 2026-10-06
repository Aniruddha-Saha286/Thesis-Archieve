/**
 * URL and Repository Validation Utilities
 * Enforces SSRF defense, supported protocol checking, and repository domain validation.
 */

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

/**
 * Validates whether a URL is a syntactically valid public HTTP/HTTPS URL
 * and safe from obvious SSRF targets.
 */
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

// Trusted repository domains for datasets and open research data
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

/**
 * Validates dataset repository URLs.
 * Rejects invalid protocols, arbitrary localhost/private addresses, or unparseable URLs.
 */
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

/**
 * Validates code repository URLs (GitHub, GitLab, Codeberg, Bitbucket, etc.)
 */
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

/**
 * Validates PDF / publication document URLs
 */
function isValidDocumentUrl(urlString) {
  if (!isValidHttpUrl(urlString)) return false;
  try {
    const parsed = new URL(urlString.trim());
    // Document URL must be https or standard http
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Checks on a RESOLVED IP address (added for the full-text PDF reader).
//
// isPrivateIpOrHost() above looks at the host name as it is written in a URL. That cannot stop a
// public-looking name such as "files.example.org" from pointing, through DNS, at 10.0.0.5 or at
// the cloud metadata address. Code that downloads a file chosen by a user must therefore resolve
// the name first and pass every address it gets through isPublicIpAddress() below.
// ---------------------------------------------------------------------------

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
  if (a === 0) return false; // "this network"
  if (a === 10) return false; // private
  if (a === 100 && c >= 64 && c <= 127) return false; // carrier-grade NAT, 100.64.0.0/10
  if (a === 127) return false; // loopback
  if (a === 169 && c === 254) return false; // link-local, includes the metadata address 169.254.169.254
  if (a === 172 && c >= 16 && c <= 31) return false; // private
  if (a === 192 && c === 0 && b[2] === 0) return false; // IETF protocol assignments
  if (a === 192 && c === 0 && b[2] === 2) return false; // documentation
  if (a === 192 && c === 88 && b[2] === 99) return false; // old 6to4 relay anycast
  if (a === 192 && c === 168) return false; // private
  if (a === 198 && (c === 18 || c === 19)) return false; // benchmarking
  if (a === 198 && c === 51 && b[2] === 100) return false; // documentation
  if (a === 203 && c === 0 && b[2] === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved and broadcast
  return true;
}

function parseIpv6(text) {
  let address = String(text).split('%')[0]; // drop a zone id such as "%eth0"
  if (address.includes('.')) {
    // An IPv4 address written at the end, as in "::ffff:10.0.0.1": turn it into two hex groups.
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

/**
 * Says whether an IP address (the result of a DNS lookup, not a host name) is an ordinary public
 * internet address. Private, loopback, link-local, carrier-grade NAT, multicast, documentation
 * and reserved ranges are refused, for IPv4 and for IPv6, and so are IPv6 addresses that merely
 * wrap a refused IPv4 address (::ffff:10.0.0.1, NAT64, 6to4). Anything that cannot be parsed is
 * treated as not public, so a strange value can never slip through.
 */
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

  // ::, ::1 and the old "IPv4-compatible" form ::a.b.c.d
  if (firstTwelveZero) return false;
  // IPv4-mapped (::ffff:a.b.c.d): judge the IPv4 address inside
  if (firstTenZero && b[10] === 0xff && b[11] === 0xff) return isPublicIpv4Bytes(b.slice(12));
  // NAT64 (64:ff9b::/96) carries an IPv4 address in its last four bytes
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    return b.slice(4, 12).every((byte) => byte === 0) && isPublicIpv4Bytes(b.slice(12));
  }
  // 6to4 (2002::/16) carries an IPv4 address in bytes 2 to 5
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicIpv4Bytes(b.slice(2, 6));
  // Teredo tunnels (2001:0::/32) and documentation (2001:db8::/32)
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x00 && b[3] === 0x00) return false;
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false;
  // Everything public lives in 2000::/3. That rule alone already refuses unique-local (fc00::/7),
  // link-local (fe80::/10), site-local (fec0::/10) and multicast (ff00::/8) addresses.
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
