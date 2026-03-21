const express      = require('express');
const Announcement = require('../models/Announcement');
const { authenticateToken, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/announcements ─────────────────────────────────────
// All active announcements for authenticated users
router.get('/', authenticateToken, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ isPinned: -1, createdAt: -1 })
      .populate('createdBy', 'firstName lastName');
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── GET /api/announcements/all ─────────────────────────────────
// Admin: all announcements including inactive
router.get('/all', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ isPinned: -1, createdAt: -1 })
      .populate('createdBy', 'firstName lastName');
    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── POST /api/announcements ────────────────────────────────────
router.post('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { title, content, category, isPinned } = req.body;
    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({ message: 'Title and content are required' });
    }
    const a = await Announcement.create({
      title:     title.trim(),
      content:   content.trim(),
      category:  category || 'general',
      isPinned:  !!isPinned,
      createdBy: req.user._id,
    });
    res.status(201).json({ announcement: a });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /api/announcements/:id ─────────────────────────────────
router.put('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const a = await Announcement.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!a) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ announcement: a });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── DELETE /api/announcements/:id ─────────────────────────────
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const a = await Announcement.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
