const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize, canAccessResource } = require('../middleware/auth');
const Balance = require('../models/Balance');
const User = require('../models/User');

const router = express.Router();

// @route   GET /api/balance
// @desc    Get current user's balance
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const balance = await Balance.getOrCreateBalance(req.user._id);
    
    // Calculate totals from transactions
    const totalSpent = balance.transactions
      .filter(t => t.type === 'deduction')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDistributed = balance.transactions
      .filter(t => t.type === 'deduction' && t.description.includes('distributed'))
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDeposited = balance.transactions
      .filter(t => t.type === 'topup')
      .reduce((sum, t) => sum + t.amount, 0);
    
    res.json({
      currentBalance: balance.currentBalance,
      totalSpent,
      totalDistributed,
      totalDeposited,
      recentTransactions: balance.getRecentTransactions(10)
    });
  } catch (error) {
    console.error('Error fetching balance:', error);
    res.status(500).json({
      message: 'Failed to fetch balance'
    });
  }
});

// @route   GET /api/balance/:userId
// @desc    Get specific user's balance (admin/reseller only)
// @access  Private
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check permissions
    if (req.user.role === 'admin') {
      // Admin can view any user's balance
    } else if (req.user.role === 'reseller') {
      // Reseller can only view their clients' balances
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    } else {
      // Regular users can only view their own balance
      if (userId !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    }
    
    const balance = await Balance.getOrCreateBalance(userId);
    const user = await User.findById(userId).select('firstName lastName email role');
    
    res.json({
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role
      },
      currentBalance: balance.currentBalance,
      recentTransactions: balance.getRecentTransactions(20)
    });
  } catch (error) {
    console.error('Error fetching user balance:', error);
    res.status(500).json({
      message: 'Failed to fetch user balance'
    });
  }
});

// @route   POST /api/balance/topup
// @desc    Add balance to user account
// @access  Private (Admin/Reseller)
router.post('/topup', authenticateToken, authorize(['admin', 'reseller']), [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { userId, amount, description } = req.body;
    
    // Check permissions
    if (req.user.role === 'reseller') {
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'You can only top up your clients\' accounts'
        });
      }
    }
    
    const balance = await Balance.getOrCreateBalance(userId);
    
    const transaction = {
      type: 'topup',
      amount: parseFloat(amount),
      description: description || `Balance top-up by ${req.user.firstName} ${req.user.lastName}`,
      performedBy: req.user._id
    };
    
    await balance.addTransaction(transaction);
    
    res.json({
      message: 'Balance topped up successfully',
      newBalance: balance.currentBalance,
      transaction: transaction
    });
  } catch (error) {
    console.error('Error topping up balance:', error);
    res.status(500).json({
      message: 'Failed to top up balance'
    });
  }
});

// @route   POST /api/balance/deduct
// @desc    Deduct balance from user account
// @access  Private (Admin/Reseller)
router.post('/deduct', authenticateToken, authorize(['admin', 'reseller']), [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters'),
  body('fileId').optional().isMongoId().withMessage('Valid file ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { userId, amount, description, fileId } = req.body;
    
    // Check permissions
    if (req.user.role === 'reseller') {
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'You can only deduct from your clients\' accounts'
        });
      }
    }
    
    const balance = await Balance.getOrCreateBalance(userId);
    
    // Check if user has sufficient balance
    if (balance.currentBalance < parseFloat(amount)) {
      return res.status(400).json({
        message: 'Insufficient balance',
        currentBalance: balance.currentBalance,
        requiredAmount: parseFloat(amount)
      });
    }
    
    const transaction = {
      type: 'deduction',
      amount: parseFloat(amount),
      description: description || `Balance deduction by ${req.user.firstName} ${req.user.lastName}`,
      relatedFile: fileId || null,
      performedBy: req.user._id
    };
    
    await balance.addTransaction(transaction);
    
    res.json({
      message: 'Balance deducted successfully',
      newBalance: balance.currentBalance,
      transaction: transaction
    });
  } catch (error) {
    console.error('Error deducting balance:', error);
    res.status(500).json({
      message: 'Failed to deduct balance'
    });
  }
});

// @route   POST /api/balance/adjust
// @desc    Adjust user balance (can be positive or negative)
// @access  Private (Admin only)
router.post('/adjust', authenticateToken, authorize(['admin']), [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('amount').isFloat().withMessage('Valid amount is required'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description cannot exceed 200 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { userId, amount, description } = req.body;
    
    const balance = await Balance.getOrCreateBalance(userId);
    
    const transaction = {
      type: 'adjustment',
      amount: parseFloat(amount),
      description: description || `Balance adjustment by ${req.user.firstName} ${req.user.lastName}`,
      performedBy: req.user._id
    };
    
    await balance.addTransaction(transaction);
    
    res.json({
      message: 'Balance adjusted successfully',
      newBalance: balance.currentBalance,
      transaction: transaction
    });
  } catch (error) {
    console.error('Error adjusting balance:', error);
    res.status(500).json({
      message: 'Failed to adjust balance'
    });
  }
});

// @route   GET /api/balance/transactions/:userId
// @desc    Get transaction history for a user
// @access  Private
router.get('/transactions/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Check permissions
    if (req.user.role === 'admin') {
      // Admin can view any user's transactions
    } else if (req.user.role === 'reseller') {
      // Reseller can only view their clients' transactions
      const targetUser = await User.findById(userId);
      if (!targetUser || !req.user.clients.includes(userId)) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    } else {
      // Regular users can only view their own transactions
      if (userId !== req.user._id.toString()) {
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    }
    
    const balance = await Balance.getOrCreateBalance(userId);
    const transactions = balance.transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);
    
    res.json({
      transactions,
      totalTransactions: balance.transactions.length,
      currentPage: parseInt(page),
      totalPages: Math.ceil(balance.transactions.length / limit)
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      message: 'Failed to fetch transactions'
    });
  }
});

module.exports = router;
