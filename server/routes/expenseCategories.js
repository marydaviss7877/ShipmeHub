const express = require('express');
const router = express.Router();
const ExpenseCategory = require('../models/ExpenseCategory');
const { authenticateToken, authorize } = require('../middleware/auth');

// GET /api/expense-categories — all categories sorted by name
router.get(
  '/',
  authenticateToken,
  authorize('admin', 'reseller'),
  async (req, res) => {
    try {
      const categories = await ExpenseCategory.find().sort({ name: 1 }).lean();
      res.json(categories);
    } catch (err) {
      console.error('[ExpenseCategories] GET /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// POST /api/expense-categories — create category
router.post(
  '/',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const { name, type, isActive } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'name is required' });
      }

      const category = new ExpenseCategory({
        name: name.trim(),
        type,
        isActive: isActive !== undefined ? isActive : true,
        createdBy: req.user._id,
      });

      await category.save();
      res.status(201).json(category);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'A category with that name already exists' });
      }
      console.error('[ExpenseCategories] POST /:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// PUT /api/expense-categories/:id — update category
router.put(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const { name, type, isActive } = req.body;
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (type !== undefined) updates.type = type;
      if (isActive !== undefined) updates.isActive = isActive;

      const category = await ExpenseCategory.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      res.json(category);
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: 'A category with that name already exists' });
      }
      console.error('[ExpenseCategories] PUT /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// DELETE /api/expense-categories/:id — delete category
router.delete(
  '/:id',
  authenticateToken,
  authorize('admin'),
  async (req, res) => {
    try {
      const category = await ExpenseCategory.findByIdAndDelete(req.params.id);

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      res.json({ message: 'Category deleted successfully' });
    } catch (err) {
      console.error('[ExpenseCategories] DELETE /:id:', err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

module.exports = router;
