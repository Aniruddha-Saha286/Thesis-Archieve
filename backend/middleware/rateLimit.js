const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Who a request is counted against.
//
// A signed-in member is counted by account, everyone else by address. Counting only by address
// punishes a whole campus: students behind one university or hostel connection share a single
// address, so a busy lab would hit the limit together and all be blocked.
// The token is checked with the site's own key before it is trusted, so a made-up token
// cannot be used to get a fresh allowance.
function memberOrAddressKey(req) {
  const header = req.headers && req.headers.authorization;
  if (header && header.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (decoded && decoded.id) return `member:${decoded.id}`;
    } catch {
      // Not a valid token: fall back to the address
    }
  }
  return ipKeyGenerator(req.ip || '');
}

// Requests per minute for the general limit. 180 by default; API_RATE_LIMIT_PER_MINUTE can raise it.
function generalLimitPerMinute(env = process.env) {
  const parsed = parseInt(env.API_RATE_LIMIT_PER_MINUTE, 10);
  return Number.isFinite(parsed) && parsed >= 30 ? Math.min(parsed, 100000) : 180;
}

// Rate limiter for authentication endpoints (Google OAuth & Admin Login)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

// Stricter rate limiter for password-based admin login to protect against brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many admin login attempts from this IP. Please try again after 15 minutes.',
  },
});

// General API rate limiter for broad traffic control
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: generalLimitPerMinute(), // Generous baseline so research use is not frustrated
  keyGenerator: memberOrAddressKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests in a short time. Please wait a minute and try again.',
  },
});

// Rate limiter for committed paper searches (prevents rapid automated scraping)
const searchCommitLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 35, // 35 search commits per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Search query rate limit reached. Please pause a moment before submitting additional queries.',
  },
});

// Rate limiter for external dataset lookups (DataCite / Zenodo)
const datasetLookupLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Dataset discovery rate limit reached. Please wait a moment before querying external repositories.',
  },
});

// Rate limiter for AI quick summary generation
const summaryGenerationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Quick Summary generation rate limit reached. Please wait before summarizing additional papers.',
  },
});

// Rate limiter for institutional analytics
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Institution research landscape rate limit reached. Please wait a moment.',
  },
});

// Stricter limiter for identity and thesis file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Document upload limit reached. Please wait 15 minutes before uploading additional files.',
  },
});

// Thesis PDF uploads are counted per signed-in member, so one busy campus network is not one user.
const thesisPdfUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `thesis-pdf:${memberOrAddressKey(req)}`,
  message: {
    message: 'You have uploaded several files in a short time. Please wait 15 minutes and try again.',
  },
});

// Stricter limiter for bKash payment orders and claim submissions
const paymentActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Payment action limit reached. Please try again after 15 minutes.',
  },
});

// Reading a paper's PDF downloads up to 15 MB per uncached request, so it is limited tightly
const fullTextLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'You are opening full texts too quickly. Please wait a moment and try again.',
  },
});

// "Find a free PDF" asks an outside service once per paper
const openAccessFinderLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many free-PDF lookups. Please wait a moment and try again.',
  },
});

// Limiter for high-privilege administrative actions
const adminActionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Administrative action rate limit reached. Please wait a moment.',
  },
});

module.exports = {
  authLimiter,
  loginLimiter,
  apiLimiter,
  searchCommitLimiter,
  datasetLookupLimiter,
  summaryGenerationLimiter,
  analyticsLimiter,
  uploadLimiter,
  thesisPdfUploadLimiter,
  paymentActionLimiter,
  adminActionLimiter,
  fullTextLimiter,
  openAccessFinderLimiter,
  memberOrAddressKey,
  generalLimitPerMinute,
};
