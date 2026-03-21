const express = require('express');
const router  = express.Router();
const Wallet  = require('../models/Wallet');
const { authenticateToken, authorize } = require('../middleware/auth');

// GET /api/wallets — all wallets (admin + reseller can read to show in forms)
router.get('/', authenticateToken, authorize('admin', 'reseller'), async (req, res) => {
  try {
    const wallets = await Wallet.find().sort({ name: 1 });
    res.json({ wallets });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/wallets — create wallet (admin only)
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });
    const wallet = await Wallet.create({ name, description, createdBy: req.user._id });
    res.status(201).json({ wallet });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Wallet name already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/wallets/:id — update wallet (admin only)
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const wallet = await Wallet.findById(req.params.id);
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });

    if (name        !== undefined) wallet.name        = name;
    if (description !== undefined) wallet.description = description;
    if (isActive    !== undefined) wallet.isActive    = isActive;

    await wallet.save();
    res.json({ wallet });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Wallet name already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/wallets/:id — delete wallet (admin only)
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const wallet = await Wallet.findById(req.params.id);
    if (!wallet) return res.status(404).json({ message: 'Wallet not found' });
    await wallet.deleteOne();
    res.json({ message: 'Wallet deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
