const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize } = require('../middleware/auth');
const User = require('../models/User');
const { sendEmail, emailTemplates } = require('../utils/email');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private (Admin)
router.get('/', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 10, search } = req.query;
    
    let query = {};
    
    if (role) {
      query.role = role;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      message: 'Server error getting users'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      message: 'Server error getting user'
    });
  }
});

// @route   POST /api/users
// @desc    Create new user (admin only)
// @access  Private (Admin)
router.post('/', authenticateToken, authorize('admin'), [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'reseller', 'user']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { firstName, lastName, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists with this email'
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      role
    });

    await user.save();

    // Send welcome email
    try {
      await sendEmail({
        to: user.email,
        subject: emailTemplates.userCreated(user.fullName, user.email, password, user.role).subject,
        html: emailTemplates.userCreated(user.fullName, user.email, password, user.role).html
      });
    } catch (emailError) {
      console.error('Welcome email error:', emailError);
      // Don't fail user creation if email fails
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      message: 'Server error creating user'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', authenticateToken, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('role').optional().isIn(['admin', 'reseller', 'user']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Only admin can change role and isActive
    if (req.user.role !== 'admin') {
      delete req.body.role;
      delete req.body.isActive;
    }

    // Check if email is being changed and if it's already taken
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(400).json({
          message: 'Email already exists'
        });
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      message: 'User updated successfully',
      user: updatedUser
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      message: 'Server error updating user'
    });
  }
});

// @route   PUT /api/users/:id/password
// @desc    Update user password
// @access  Private
router.put('/:id/password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id).select('+password');
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      message: 'Server error updating password'
    });
  }
});

// @route   PUT /api/users/:id/reset-password
// @desc    Reset user password (admin only)
// @access  Private (Admin)
router.put('/:id/reset-password', authenticateToken, authorize('admin'), [
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { newPassword } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: 'Server error resetting password'
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user (admin only)
// @access  Private (Admin)
router.delete('/:id', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({
        message: 'Cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      message: 'Server error deleting user'
    });
  }
});

// @route   GET /api/users/:id/clients
// @desc    Get reseller's clients
// @access  Private
router.get('/:id/clients', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Get clients
    const clients = await User.find({ _id: { $in: user.clients } })
      .select('-password')
      .sort({ firstName: 1 });

    res.json({ clients });

  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      message: 'Server error getting clients'
    });
  }
});

// @route   POST /api/users/:id/clients
// @desc    Add client to reseller
// @access  Private (Admin)
router.post('/:id/clients', authenticateToken, authorize('admin'), [
  body('clientId').isMongoId().withMessage('Valid client ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { clientId } = req.body;
    const reseller = await User.findById(req.params.id);
    const client = await User.findById(clientId);
    
    if (!reseller) {
      return res.status(404).json({
        message: 'Reseller not found'
      });
    }

    if (!client) {
      return res.status(404).json({
        message: 'Client not found'
      });
    }

    if (reseller.role !== 'reseller') {
      return res.status(400).json({
        message: 'User is not a reseller'
      });
    }

    if (client.role === 'admin') {
      return res.status(400).json({
        message: 'Cannot assign admin as client'
      });
    }

    // Add client if not already added
    if (!reseller.clients.includes(clientId)) {
      reseller.clients.push(clientId);
      await reseller.save();
    }

    res.json({
      message: 'Client added successfully',
      client: {
        id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        email: client.email,
        fullName: client.fullName
      }
    });

  } catch (error) {
    console.error('Add client error:', error);
    res.status(500).json({
      message: 'Server error adding client'
    });
  }
});

// @route   DELETE /api/users/:id/clients/:clientId
// @desc    Remove client from reseller
// @access  Private (Admin)
router.delete('/:id/clients/:clientId', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    const reseller = await User.findById(req.params.id);
    
    if (!reseller) {
      return res.status(404).json({
        message: 'Reseller not found'
      });
    }

    reseller.clients = reseller.clients.filter(
      clientId => clientId.toString() !== req.params.clientId
    );
    
    await reseller.save();

    res.json({
      message: 'Client removed successfully'
    });

  } catch (error) {
    console.error('Remove client error:', error);
    res.status(500).json({
      message: 'Server error removing client'
    });
  }
});

module.exports = router;
