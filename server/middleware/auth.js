const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    console.log('Authentication check:', {
      decodedUserId: decoded.userId,
      foundUser: !!user,
      userRole: user?.role,
      isActive: user?.isActive
    });
    
    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid token. User not found.' 
      });
    }

    if (!user.isActive) {
      return res.status(401).json({ 
        message: 'Account is deactivated. Please contact admin.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        message: 'Invalid token.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        message: 'Token expired. Please login again.' 
      });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      message: 'Server error during authentication.' 
    });
  }
};

// Check if user has required role
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required.' 
      });
    }

    // Flatten the roles array in case it's nested
    const flatRoles = roles.flat();
    
    console.log('Authorization check:', {
      userId: req.user._id,
      userRole: req.user.role,
      requiredRoles: flatRoles,
      hasAccess: flatRoles.includes(req.user.role)
    });

    if (!flatRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. Required role: ${flatRoles.join(' or ')}` 
      });
    }

    next();
  };
};

// Check if user can access resource (own resource or admin/reseller)
const canAccessResource = (resourceUserId) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        message: 'Authentication required.' 
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Reseller can access their own resources and their clients' resources
    if (req.user.role === 'reseller') {
      if (req.user._id.toString() === resourceUserId || 
          req.user.clients.includes(resourceUserId)) {
        return next();
      }
    }

    // User can only access their own resources
    if (req.user._id.toString() === resourceUserId) {
      return next();
    }

    return res.status(403).json({ 
      message: 'Access denied. You can only access your own resources.' 
    });
  };
};

// Optional authentication (for public routes that can benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

module.exports = {
  authenticateToken,
  authorize,
  canAccessResource,
  optionalAuth
};
