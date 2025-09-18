const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, authorize, canAccessResource } = require('../middleware/auth');
const { upload, saveFileToGridFS, getFileById, getFileStream, deleteFile, getUserFiles, isGridFSReady } = require('../config/gridfs');
const File = require('../models/File');
const User = require('../models/User');
const Balance = require('../models/Balance');
const Rate = require('../models/Rate');
const { sendEmail, emailTemplates } = require('../utils/email');
const { validateLabelFile, parseLabelQuantity } = require('../utils/excelParser');

const router = express.Router();

// @route   POST /api/files/upload
// @desc    Upload a file (label request or generated label)
// @access  Private
router.post('/upload', authenticateToken, upload.single('file'), [
  body('fileType').isIn(['label_request', 'generated_label']).withMessage('Invalid file type')
], async (req, res) => {
  try {
    console.log('File upload request received');
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({
        message: 'No file uploaded'
      });
    }

    // Check if GridFS is ready
    if (!isGridFSReady()) {
      console.log('GridFS not ready for upload');
      return res.status(503).json({
        message: 'File storage service not ready. Please try again in a moment.'
      });
    }

    const { fileType, clientId } = req.body;

    console.log('Upload request details:', {
      fileType,
      clientId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      userId: req.user._id
    });

    // Save file to GridFS
    console.log('Starting GridFS upload...');
    const gridFile = await saveFileToGridFS(req.file, {
      originalName: req.file.originalname,
      uploadedBy: req.user._id,
      fileType: fileType || 'unknown',
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    console.log('GridFS upload completed:', gridFile);

    // Calculate label quantity for label requests
    let totalLabels = 0;
    if (fileType === 'label_request') {
      const validation = validateLabelFile(req.file.buffer, req.file.originalname);
      if (validation.isValid) {
        totalLabels = validation.totalLabels;
      }
    }

    // Create file record in database
    console.log('Creating file record in database...');
    const fileRecord = new File({
      filename: gridFile.filename,
      originalName: req.file.originalname,
      fileId: gridFile._id,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user._id,
      clientId: clientId || null,
      fileType,
      requestDetails: {
        totalLabels
      }
    });

    await fileRecord.save();
    console.log('File record saved to database:', fileRecord._id);

    // If this is a generated label, link it to the original request and deduct balance
    if (fileType === 'generated_label' && req.body.relatedRequestId) {
      const originalRequest = await File.findById(req.body.relatedRequestId);
      if (originalRequest) {
        // Link the generated label to the request
        fileRecord.relatedRequest = originalRequest._id;
        await fileRecord.save();
        
        // Add the generated label to the request's generatedLabels array
        originalRequest.generatedLabels.push(fileRecord._id);
        originalRequest.status = 'completed';
        await originalRequest.save();
        
        // Deduct balance from the original requester
        const requesterBalance = await Balance.getOrCreateBalance(originalRequest.uploadedBy);
        const rate = await Rate.getCurrentRate(originalRequest.uploadedBy);
        
        if (rate && originalRequest.requestDetails.totalLabels) {
          const totalCost = originalRequest.requestDetails.totalLabels * rate.labelRate;
          
          const transaction = {
            type: 'deduction',
            amount: totalCost,
            description: `Label generation for request: ${originalRequest.originalName}`,
            relatedFile: originalRequest._id,
            performedBy: req.user._id
          };
          
          await requesterBalance.addTransaction(transaction);
          console.log('Balance deducted for label generation:', totalCost);
        }
        
        console.log('Linked generated label to request:', originalRequest._id);
      }
    }

    // Send email notification to admin for label requests
    if (fileType === 'label_request') {
      try {
        const adminUsers = await User.find({ role: 'admin', isActive: true });
        
        for (const admin of adminUsers) {
          await sendEmail({
            to: admin.email,
            subject: emailTemplates.fileUploaded(req.user.fullName, req.file.originalName, 'Label Request').subject,
            html: emailTemplates.fileUploaded(req.user.fullName, req.file.originalName, 'Label Request').html
          });
        }

        // Emit real-time update
        req.io.emit('file-uploaded', {
          fileId: fileRecord._id,
          uploadedBy: req.user.fullName,
          fileName: req.file.originalName,
          fileType,
          timestamp: new Date()
        });

      } catch (emailError) {
        console.error('Email notification error:', emailError);
        // Don't fail the upload if email fails
      }
    }

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileRecord._id,
        filename: fileRecord.filename,
        originalName: fileRecord.originalName,
        fileType: fileRecord.fileType,
        status: fileRecord.status,
        size: fileRecord.size,
        uploadedAt: fileRecord.createdAt
      }
    });

  } catch (error) {
    console.error('File upload error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      message: 'Server error during file upload',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   GET /api/files
// @desc    Get files for current user
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { fileType, status, page = 1, limit = 10 } = req.query;
    
    let query = {};
    
    // For admin users, show all files
    if (req.user.role === 'admin') {
      query = {};
    } else if (req.user.role === 'reseller') {
      // For resellers, only show their own files and their clients' files (no separate generated labels)
      query = {
        $or: [
          { uploadedBy: req.user._id },
          { clientId: { $in: req.user.clients } }
        ]
      };
    } else {
      // For regular users, only show their own files (no separate generated labels)
      query = { uploadedBy: req.user._id };
    }

    if (fileType) {
      query.fileType = fileType;
    }
    
    if (status) {
      query.status = status;
    }

    const files = await File.find(query)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('clientId', 'firstName lastName email')
      .populate('processingDetails.processedBy', 'firstName lastName email')
      .populate('relatedRequest', 'originalName status')
      .populate('generatedLabels', 'originalName status')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await File.countDocuments(query);

    res.json({
      files,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({
      message: 'Server error getting files'
    });
  }
});

// @route   GET /api/files/:id
// @desc    Get file details
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const file = await File.findById(req.params.id)
      .populate('uploadedBy', 'firstName lastName email')
      .populate('clientId', 'firstName lastName email')
      .populate('processingDetails.processedBy', 'firstName lastName email');

    if (!file) {
      return res.status(404).json({
        message: 'File not found'
      });
    }

    // Check access permissions
    if (req.user.role !== 'admin' && 
        file.uploadedBy._id.toString() !== req.user._id.toString() &&
        !req.user.clients.includes(file.clientId?._id)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    res.json({ file });

  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({
      message: 'Server error getting file'
    });
  }
});

// @route   POST /api/files/calculate-labels
// @desc    Calculate label quantity and balance preview
// @access  Private
router.post('/calculate-labels', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'No file uploaded'
      });
    }

    // Validate file format
    const validation = validateLabelFile(req.file.buffer, req.file.originalname);
    if (!validation.isValid) {
      return res.status(400).json({
        message: validation.error
      });
    }

    // Get user's current rate
    const rate = await Rate.getCurrentRate(req.user._id);
    if (!rate) {
      return res.status(400).json({
        message: 'No rate set for your account. Please contact your administrator.'
      });
    }

    // Get user's current balance
    const balance = await Balance.getOrCreateBalance(req.user._id);

    // Calculate total cost
    const totalCost = validation.totalLabels * rate.labelRate;

    // Check if user has sufficient balance
    const hasSufficientBalance = balance.currentBalance >= totalCost;

    res.json({
      totalLabels: validation.totalLabels,
      totalShipments: validation.totalShipments,
      labelRate: rate.labelRate,
      currency: rate.currency,
      totalCost,
      currentBalance: balance.currentBalance,
      hasSufficientBalance,
      balanceAfterDeduction: balance.currentBalance - totalCost
    });

  } catch (error) {
    console.error('Error calculating labels:', error);
    res.status(500).json({
      message: 'Failed to calculate label quantity'
    });
  }
});

// @route   GET /api/files/pending-requests
// @desc    Get pending label requests for admin
// @access  Private (Admin only)
router.get('/pending-requests', authenticateToken, authorize(['admin']), async (req, res) => {
  try {
    const pendingRequests = await File.find({
      fileType: 'label_request',
      status: 'pending'
    })
    .populate('uploadedBy', 'firstName lastName email role')
    .populate('clientId', 'firstName lastName email')
    .sort({ createdAt: -1 });

    res.json({
      requests: pendingRequests,
      count: pendingRequests.length
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({
      message: 'Failed to fetch pending requests'
    });
  }
});

// @route   GET /api/files/:id/download
// @desc    Download file
// @access  Private
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    console.log('Download request:', {
      fileId: req.params.id,
      userId: req.user._id,
      userRole: req.user.role
    });
    
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        message: 'File not found'
      });
    }

    // Check access permissions
    if (req.user.role !== 'admin') {
      let hasAccess = false;
      
      // Check if user uploaded the file directly
      if (file.uploadedBy.toString() === req.user._id.toString()) {
        hasAccess = true;
      }
      
      // Check if user is a reseller and file belongs to their client
      if (!hasAccess && req.user.role === 'reseller' && file.clientId && req.user.clients.includes(file.clientId)) {
        hasAccess = true;
      }
      
      // Check if this is a generated label linked to user's request
      if (!hasAccess && file.fileType === 'generated_label' && file.relatedRequest) {
        const relatedRequest = await File.findById(file.relatedRequest);
        if (relatedRequest) {
          // Check if the related request belongs to the user
          if (relatedRequest.uploadedBy.toString() === req.user._id.toString()) {
            hasAccess = true;
          }
          // Check if user is a reseller and related request belongs to their client
          if (!hasAccess && req.user.role === 'reseller' && relatedRequest.clientId && req.user.clients.includes(relatedRequest.clientId)) {
            hasAccess = true;
          }
        }
      }
      
      if (!hasAccess) {
        console.log('Access denied for file:', {
          fileId: file._id,
          fileType: file.fileType,
          uploadedBy: file.uploadedBy,
          clientId: file.clientId,
          relatedRequest: file.relatedRequest,
          userId: req.user._id,
          userRole: req.user.role
        });
        return res.status(403).json({
          message: 'Access denied'
        });
      }
    }

    // Get file from GridFS
    console.log('Getting file from GridFS:', file.fileId);
    const gridFile = await getFileById(file.fileId);
    if (!gridFile) {
      console.log('File not found in GridFS:', file.fileId);
      return res.status(404).json({
        message: 'File not found in storage'
      });
    }

    console.log('GridFS file found:', {
      id: gridFile._id,
      filename: gridFile.filename,
      contentType: gridFile.contentType,
      length: gridFile.length
    });

    // Update access metadata
    await file.updateAccess();

    // Set headers for download
    res.set({
      'Content-Type': gridFile.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.originalName}"`,
      'Content-Length': gridFile.length
    });

    console.log('Starting file stream...');
    // Stream file to client
    const downloadStream = getFileStream(file.fileId);
    
    downloadStream.on('error', (error) => {
      console.error('Download stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error streaming file' });
      }
    });
    
    downloadStream.on('end', () => {
      console.log('Download stream ended');
    });
    
    downloadStream.pipe(res);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      message: 'Server error downloading file'
    });
  }
});

// @route   PUT /api/files/:id/status
// @desc    Update file status (admin only)
// @access  Private (Admin)
router.put('/:id/status', authenticateToken, authorize('admin'), [
  body('status').isIn(['pending', 'processing', 'completed', 'failed']).withMessage('Invalid status'),
  body('processingNotes').optional().isLength({ max: 500 }).withMessage('Processing notes cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { status, processingNotes } = req.body;
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        message: 'File not found'
      });
    }

    // Update file status
    file.status = status;
    
    if (status === 'completed' || status === 'processing') {
      file.processingDetails = {
        ...file.processingDetails,
        processedBy: req.user._id,
        processedAt: new Date(),
        processingNotes
      };
    }

    await file.save();

    // Send email notification when labels are completed
    if (status === 'completed' && file.fileType === 'label_request') {
      try {
        const user = await User.findById(file.uploadedBy);
        if (user) {
          const downloadUrl = `${process.env.CLIENT_URL}/files/${file._id}/download`;
          await sendEmail({
            to: user.email,
            subject: emailTemplates.labelsGenerated(user.fullName, file.originalName, downloadUrl).subject,
            html: emailTemplates.labelsGenerated(user.fullName, file.originalName, downloadUrl).html
          });
        }

        // Emit real-time update
        req.io.to(file.uploadedBy.toString()).emit('file-completed', {
          fileId: file._id,
          fileName: file.originalName,
          status: 'completed',
          timestamp: new Date()
        });

      } catch (emailError) {
        console.error('Email notification error:', emailError);
        // Don't fail the status update if email fails
      }
    }

    res.json({
      message: 'File status updated successfully',
      file: {
        id: file._id,
        status: file.status,
        processingDetails: file.processingDetails
      }
    });

  } catch (error) {
    console.error('Update file status error:', error);
    res.status(500).json({
      message: 'Server error updating file status'
    });
  }
});

// @route   DELETE /api/files/:id
// @desc    Delete file
// @access  Private
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        message: 'File not found'
      });
    }

    // Check permissions (admin can delete any file, users can only delete their own)
    if (req.user.role !== 'admin' && file.uploadedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    // Delete from GridFS
    await deleteFile(file.fileId);

    // Delete from database
    await File.findByIdAndDelete(req.params.id);

    res.json({
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      message: 'Server error deleting file'
    });
  }
});

module.exports = router;
