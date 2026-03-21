const express = require('express');
const { body, validationResult } = require('express-validator');
const Rate = require('../models/Rate');
const User = require('../models/User');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/rates ────────────────────────────────────────────
// Get current user's active rate
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rate = await Rate.getCurrentRate(req.user._id);
    if (!rate) return res.status(404).json({ message: 'Rate not found' });
    res.json({ rate });
  } catch (error) {
    console.error('Get rate error:', error);
    res.status(500).json({ message: 'Server error getting rate' });
  }
});

// ── GET /api/rates/history ────────────────────────────────────
// Get rate history for current user
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const rates = await Rate.find({ user: req.user._id })
      .sort({ effectiveFrom: -1 });
    res.json({ rates });
  } catch (error) {
    console.error('Get rate history error:', error);
    res.status(500).json({ message: 'Server error getting rate history' });
  }
});

// ── POST /api/rates ───────────────────────────────────────────
// Set a new rate for a user (admin only)
router.post('/', authenticateToken, authorize('admin'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('labelRate').isNumeric().withMessage('Label rate must be a number'),
  body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'CAD']).withMessage('Invalid currency'),
  body('notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { userId, labelRate, notes = '' } = req.body;

    const targetUser = await User.findById(userId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const newRate = await Rate.setRate(userId, parseFloat(labelRate), req.user._id, notes);

    res.json({ message: 'Rate updated successfully', rate: newRate });
  } catch (error) {
    console.error('Set rate error:', error);
    res.status(500).json({ message: 'Server error setting rate' });
  }
});

module.exports = router;