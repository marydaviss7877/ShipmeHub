const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize } = require('../middleware/auth');
const { sendEmail, emailTemplates } = require('../utils/email');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/email/send
// @desc    Send custom email (admin only)
// @access  Private (Admin)
router.post('/send', authenticateToken, authorize('admin'), [
  body('to').isEmail().withMessage('Valid email address is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('message').notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { to, subject, message, isHtml = false } = req.body;

    await sendEmail({
      to,
      subject,
      html: isHtml ? message : message.replace(/\n/g, '<br>'),
      text: message
    });

    res.json({
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      message: 'Server error sending email'
    });
  }
});

// @route   POST /api/email/broadcast
// @desc    Send broadcast email to all users (admin only)
// @access  Private (Admin)
router.post('/broadcast', authenticateToken, authorize('admin'), [
  body('subject').notEmpty().withMessage('Subject is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('roles').optional().isArray().withMessage('Roles must be an array'),
  body('roles.*').optional().isIn(['admin', 'reseller', 'user']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { subject, message, roles = ['admin', 'reseller', 'user'], isHtml = false } = req.body;

    // Get users based on roles
    const users = await User.find({ 
      role: { $in: roles },
      isActive: true 
    }).select('email firstName lastName');

    if (users.length === 0) {
      return res.status(400).json({
        message: 'No users found for the specified roles'
      });
    }

    // Send email to each user
    const emailPromises = users.map(user => 
      sendEmail({
        to: user.email,
        subject: `[USPS Label Portal] ${subject}`,
        html: isHtml ? message : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #007bff;">${subject}</h2>
            <p>Hello ${user.fullName},</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              ${isHtml ? message : message.replace(/\n/g, '<br>')}
            </div>
            <p>Best regards,<br>USPS Label Portal Team</p>
          </div>
        `,
        text: message
      })
    );

    await Promise.all(emailPromises);

    res.json({
      message: `Broadcast email sent successfully to ${users.length} users`,
      recipients: users.length
    });

  } catch (error) {
    console.error('Broadcast email error:', error);
    res.status(500).json({
      message: 'Server error sending broadcast email'
    });
  }
});

// @route   POST /api/email/test
// @desc    Send test email to admin
// @access  Private (Admin)
router.post('/test', authenticateToken, authorize('admin'), async (req, res) => {
  try {
    await sendEmail({
      to: req.user.email,
      subject: 'Test Email - USPS Label Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #007bff;">Test Email</h2>
          <p>Hello ${req.user.fullName},</p>
          <p>This is a test email to verify that the email system is working correctly.</p>
          <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p><strong>Test Details:</strong></p>
            <p>• Sent at: ${new Date().toLocaleString()}</p>
            <p>• From: USPS Label Portal System</p>
            <p>• Status: Email system is working correctly</p>
          </div>
          <p>If you received this email, the email configuration is working properly.</p>
          <p>Best regards,<br>USPS Label Portal Team</p>
        </div>
      `
    });

    res.json({
      message: 'Test email sent successfully'
    });

  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      message: 'Server error sending test email'
    });
  }
});

// @route   GET /api/email/templates
// @desc    Get available email templates
// @access  Private (Admin)
router.get('/templates', authenticateToken, authorize('admin'), (req, res) => {
  const templates = {
    fileUploaded: {
      name: 'File Uploaded Notification',
      description: 'Sent to admin when a user uploads a file',
      variables: ['userName', 'fileName', 'fileType']
    },
    labelsGenerated: {
      name: 'Labels Generated Notification',
      description: 'Sent to user when their labels are ready',
      variables: ['userName', 'fileName', 'downloadUrl']
    },
    userCreated: {
      name: 'User Created Welcome',
      description: 'Sent to new users when account is created',
      variables: ['userName', 'email', 'password', 'role']
    },
    passwordReset: {
      name: 'Password Reset',
      description: 'Sent when user requests password reset',
      variables: ['userName', 'resetUrl']
    }
  };

  res.json({ templates });
});

module.exports = router;
