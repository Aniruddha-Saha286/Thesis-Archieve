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

module.exports = {
  isPrivateIpOrHost,
  isValidHttpUrl,
  isValidDatasetRepositoryUrl,
  isValidCodeRepositoryUrl,
  isValidDocumentUrl,
};
