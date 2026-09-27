const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Server configuration error: JWT_SECRET environment variable is required.');
  }
  return secret;
};

// Strict Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Access denied: Authentication token required.' });
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'User not found or session expired.' });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        message: 'Account Suspended: Your access has been revoked by administration.',
        status: 'banned',
        banReason: user.banReason || 'Administrative suspension',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.message && err.message.includes('JWT_SECRET')) {
      console.error(err.message);
      return res.status(500).json({ message: 'Authentication service configuration error.' });
    }
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// Optional Authentication Middleware for Public Endpoints
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id).select('-password');
    if (user && user.status !== 'banned') {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (e) {
    req.user = null;
  }
  next();
};

// Middleware: Student must be approved by admin (or be an admin)
const requireApproved = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (req.user.role === 'admin' || req.user.role === 'editor') {
    return next();
  }

  if (req.user.status === 'banned') {
    return res.status(403).json({
      message: 'Account Suspended: Your access has been revoked by administration.',
      status: 'banned',
      banReason: req.user.banReason || 'Administrative suspension',
    });
  }

  if (req.user.status === 'approved') {
    return next();
  }

  return res.status(403).json({
    message: 'Access restricted: Your academic credentials are still pending verification by the admin.',
    status: req.user.status,
  });
};

// Middleware: Admin only
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  if (req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ message: 'Access denied: Administrator privileges required.' });
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireApproved,
  requireAdmin,
  getJwtSecret,
};
