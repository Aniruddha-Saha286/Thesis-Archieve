const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

function memberOrAddressKey(req) {
  const header = req.headers && req.headers.authorization;
  if (header && header.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (decoded && decoded.id) return `member:${decoded.id}`;
    } catch {
    }
  }
  return ipKeyGenerator(req.ip || '');
}

function generalLimitPerMinute(env = process.env) {
  const parsed = parseInt(env.API_RATE_LIMIT_PER_MINUTE, 10);
  return Number.isFinite(parsed) && parsed >= 30 ? Math.min(parsed, 100000) : 180;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many admin login attempts from this IP. Please try again after 15 minutes.',
  },
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: generalLimitPerMinute(),
  keyGenerator: memberOrAddressKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many requests in a short time. Please wait a minute and try again.',
  },
});

const searchCommitLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  keyGenerator: memberOrAddressKey,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Search query rate limit reached. Please pause a moment before submitting additional queries.',
  },
});

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

const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Institution research landscape rate limit reached. Please wait a moment.',
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Document upload limit reached. Please wait 15 minutes before uploading additional files.',
  },
});

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

const paymentActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Payment action limit reached. Please try again after 15 minutes.',
  },
});

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
