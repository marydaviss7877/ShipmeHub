const express = require('express');
const router = express.Router();
const EquityPartner = require('../models/EquityPartner');
const { authenticateToken, authorize } = require('../middleware/auth');

// GET /api/equity-partners — all partners
router.get(
  '/',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const partners = await EquityPartner.find().sort({ name: 1 }).lean();
      res.json(partners);
    } catch (err) {
      console.error('[EquityPartners] GET /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/equity-partners — create partner
router.post(
  '/',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const { name, ownershipPercent, isActive } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'name is required' });
      }
      if (ownershipPercent === undefined || ownershipPercent === null) {
        return res.status(400).json({ message: 'ownershipPercent is required' });
      }

      const partner = new EquityPartner({
        name: name.trim(),
        ownershipPercent,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user._id,
      });

      await partner.save();
      res.status(201).json(partner);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'An equity partner with that name already exists' });
      }
      console.error('[EquityPartners] POST /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/equity-partners/:id — update partner
router.put(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const { name, ownershipPercent, isActive } = req.body;
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (ownershipPercent !== undefined) updates.ownershipPercent = ownershipPercent;
      if (isActive !== undefined) updates.isActive = isActive;

      const partner = await EquityPartner.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!partner) {
        return res.status(404).json({ message: 'Equity partner not found' });
      }

      res.json(partner);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'An equity partner with that name already exists' });
      }
      console.error('[EquityPartners] PUT /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/equity-partners/:id — delete partner
router.delete(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const partner = await EquityPartner.findByIdAndDelete(req.params.id);

      if (!partner) {
        return res.status(404).json({ message: 'Equity partner not found' });
      }

      res.json({ message: 'Equity partner deleted successfully' });
    } catch (err) {
      console.error('[EquityPartners] DELETE /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

module.exports = router;
