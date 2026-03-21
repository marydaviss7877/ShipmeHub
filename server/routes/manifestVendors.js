const express = require('express');
const { body, validationResult } = require('express-validator');
const ManifestVendor = require('../models/ManifestVendor');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes are admin-only
router.use(authenticateToken, authorize('admin'));

// ── GET /api/manifest-vendors ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const vendors = await ManifestVendor.find().sort({ name: 1 });
    res.json({ vendors });
  } catch (err) {
    console.error('Get manifest vendors error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/manifest-vendors ────────────────────────────────
router.post('/', [
  body('name').notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('carriers').isArray({ min: 1 }).withMessage('At least one carrier is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const {
      name, email, password, notifyEmail,
      carriers, vendorRate, description, isActive, scoreOverride,
    } = req.body;

    const existing = await ManifestVendor.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'A vendor with this email already exists' });
    }

    const vendor = new ManifestVendor({
      name, email,
      notifyEmail:   notifyEmail   || '',
      carriers:      carriers      || [],
      vendorRate:    vendorRate    || 0,
      description:   description  || '',
      isActive:      isActive !== undefined ? isActive : true,
      scoreOverride: scoreOverride || null,
    });

    if (password && password.trim()) {
      vendor.password = password; // pre-save hook will hash
    }

    await vendor.save();
    res.status(201).json({ message: 'Vendor created', vendor });
  } catch (err) {
    console.error('Create manifest vendor error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/manifest-vendors/:id ────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const vendor = await ManifestVendor.findById(req.params.id).select('+password');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { password, ...rest } = req.body;
    Object.assign(vendor, rest);

    if (password && password.trim()) {
      vendor.password = password; // pre-save hook will hash
    }

    await vendor.save();
    const result = vendor.toObject();
    delete result.password;
    res.json({ message: 'Vendor updated', vendor: result });
  } catch (err) {
    console.error('Update manifest vendor error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/manifest-vendors/:id ─────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const vendor = await ManifestVendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (err) {
    console.error('Delete manifest vendor error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/manifest-vendors/:id/payout ────────────────────
// Mark payable balance as paid (full or partial)
router.post('/:id/payout', [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const vendor = await ManifestVendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const amount = parseFloat(req.body.amount);
    if (amount > vendor.payableBalance) {
      return res.status(400).json({ message: 'Payout amount exceeds payable balance' });
    }

    vendor.payableBalance -= amount;
    vendor.totalPaidOut   += amount;
    vendor.payouts.push({
      amount,
      note:   req.body.note || '',
      paidAt: new Date(),
      paidBy: req.user._id,
    });

    await vendor.save();
    res.json({ message: 'Payout recorded', vendor });
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/manifest-vendors/:id/adjust-balance ────────────
// Admin can manually adjust payable balance (override / negotiate)
router.post('/:id/adjust-balance', [
  body('amount').isFloat().withMessage('Amount is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const vendor = await ManifestVendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const amount = parseFloat(req.body.amount);
    vendor.payableBalance = Math.max(0, vendor.payableBalance + amount);
    await vendor.save();

    res.json({ message: 'Balance adjusted', vendor });
  } catch (err) {
    console.error('Adjust balance error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
