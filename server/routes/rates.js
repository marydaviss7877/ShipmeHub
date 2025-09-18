const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize, canAccessResource } = require('../middleware/auth');
const Rate = require('../models/Rate');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/rates
// @desc    Get current user's rate
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rate = await Rate.getCurrentRate(req.user._id);
    
    if (!rate) {
      return res.status(404).json({
        message: 'No rate set for this user'
      });
    }
    
    res.json({
      labelRate: rate.labelRate,
      currency: rate.currency,
      effectiveFrom: rate.effectiveFrom,
      notes: rate.notes
    });
  } catch (error) {
    console.error('Error fetching rate:', error);
    res.status(500).json({
      message: 'Failed to fetch rate'
    });
  }
});

// @route   GET /api/rates/:userId
// @desc    Get specific user's rate (admin/reseller only)
// @access  Private
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check permissions
    if (req.user.role === 'admin') {
      // Admin can view any user's rate
    } else if (req.user.role === 'reseller') {
      // Reseller can only view their clients' rates
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    } else {
      // Regular users can only view their own rate
      if (userId !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    }
    
    const rate = await Rate.getCurrentRate(userId);
    const user = await User.findById(userId).select('firstName lastName email role');
    
    if (!rate) {
      return res.status(404).json({
        message: 'No rate set for this user',
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role
        }
      });
    }
    
    res.json({
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role
      },
      labelRate: rate.labelRate,
      currency: rate.currency,
      effectiveFrom: rate.effectiveFrom,
      notes: rate.notes,
      setBy: rate.setBy
    });
  } catch (error) {
    console.error('Error fetching user rate:', error);
    res.status(500).json({
      message: 'Failed to fetch user rate'
    });
  }
});

// @route   POST /api/rates/set
// @desc    Set rate for a user
// @access  Private (Admin/Reseller)
router.post('/set', authenticateToken, authorize(['admin', 'reseller']), [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('labelRate').isFloat({ min: 0 }).withMessage('Label rate must be a positive number'),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD']).withMessage('Invalid currency'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { userId, labelRate, currency = 'USD', notes } = req.body;
    
    // Check permissions
    if (req.user.role === 'reseller') {
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'You can only set rates for your clients'
        });
      }
    }
    
    const rate = await Rate.setRate(userId, parseFloat(labelRate), req.user._id, notes);
    
    res.json({
      message: 'Rate set successfully',
      rate: {
        labelRate: rate.labelRate,
        currency: rate.currency,
        effectiveFrom: rate.effectiveFrom,
        notes: rate.notes
      }
    });
  } catch (error) {
    console.error('Error setting rate:', error);
    res.status(500).json({
      message: 'Failed to set rate'
    });
  }
});

// @route   GET /api/rates/history/:userId
// @desc    Get rate history for a user
// @access  Private
router.get('/history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    // Check permissions
    if (req.user.role === 'admin') {
      // Admin can view any user's rate history
    } else if (req.user.role === 'reseller') {
      // Reseller can only view their clients' rate history
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    } else {
      // Regular users can only view their own rate history
      if (userId !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    }
    
    const rates = await Rate.find({ user: userId })
      .populate('setBy', 'firstName lastName email')
      .sort({ effectiveFrom: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Rate.countDocuments({ user: userId });
    
    res.json({
      rates,
      totalRates: total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching rate history:', error);
    res.status(500).json({
      message: 'Failed to fetch rate history'
    });
  }
});

// @route   GET /api/rates/all
// @desc    Get all rates (admin only)
// @access  Private (Admin)
router.get('/all', authenticateToken, authorize(['admin']), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const rates = await Rate.find({ isActive: true })
      .populate('user', 'firstName lastName email role')
      .populate('setBy', 'firstName lastName email')
      .sort({ effectiveFrom: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Rate.countDocuments({ isActive: true });
    
    res.json({
      rates,
      totalRates: total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching all rates:', error);
    res.status(500).json({
      message: 'Failed to fetch rates'
    });
  }
});

module.exports = router;
