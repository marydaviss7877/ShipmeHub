/**
 * Dummy Authentication Middleware
 * This replaces JWT authentication with simple token-based auth
 */

const jwt = require('jsonwebtoken');
const { findUserById } = require('../data/dummyData');

// Simple token storage (in production, use Redis or similar)
const activeTokens = new Map();

// Generate a simple token
const generateToken = (userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'dummy-secret', {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
  
  // Store token with user info
  activeTokens.set(token, {
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });
  
  return token;
};

// Verify token middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      message: 'Access token required' 
    });
  }

  try {
    // Check if token exists in our active tokens
    const tokenData = activeTokens.get(token);
    if (!tokenData) {
      return res.status(401).json({ 
        message: 'Invalid or expired token' 
      });
    }

    // Check if token is expired
    if (new Date() > tokenData.expiresAt) {
      activeTokens.delete(token);
      return res.status(401).json({ 
        message: 'Token expired' 
      });
    }

    // Find user
    const user = findUserById(tokenData.userId);
    if (!user) {
      activeTokens.delete(token);
      return res.status(401).json({ 
        message: 'User not found' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated' 
      });
    }

    // Add user to request
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ 
      message: 'Invalid token' 
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: 'Insufficient permissions' 
      });
    }

    next();
  };
};

// Logout function
const logout = (token) => {
  activeTokens.delete(token);
};

// Clean up expired tokens (call this periodically)
const cleanupExpiredTokens = () => {
  const now = new Date();
  for (const [token, data] of activeTokens.entries()) {
    if (now > data.expiresAt) {
      activeTokens.delete(token);
    }
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  generateToken,
  authenticateToken,
  authorize,
  logout,
  cleanupExpiredTokens
};
