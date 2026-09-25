const rateLimit = require('express-rate-limit');

// Rate limiter for authentication endpoints (Google OAuth & Admin Login)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
  },
});

// Stricter rate limiter for password-based admin login to protect against brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8, // Max 8 failed/success password attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many admin login attempts from this IP. Please try again after 15 minutes.',
  },
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // Max 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Rate limit exceeded. Please throttle requests.',
  },
});

module.exports = {
  authLimiter,
  loginLimiter,
  apiLimiter,
};
