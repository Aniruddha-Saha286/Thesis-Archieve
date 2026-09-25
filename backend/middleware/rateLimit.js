const rateLimit = require('express-rate-limit');

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
  max: 180, // Generous baseline so research use is not frustrated
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Rate limit exceeded. Please throttle requests.',
  },
});

// Rate limiter for committed paper searches (prevents rapid automated scraping)
const searchCommitLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
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
  paymentActionLimiter,
  adminActionLimiter,
};
