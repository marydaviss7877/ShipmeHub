const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: [true, 'Filename is required'],
    trim: true
  },
  originalName: {
    type: String,
    required: [true, 'Original filename is required'],
    trim: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // For resellers - track which client this file belongs to
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  fileType: {
    type: String,
    enum: ['label_request', 'generated_label'],
    required: true
  },
  // Link generated labels to their original request
  relatedRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null
  },
  // Link label requests to their generated labels
  generatedLabels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File'
  }],
  // For label requests
  requestDetails: {
    totalLabels: {
      type: Number,
      default: 0
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    }
  },
  // For generated labels
  processingDetails: {
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    processedAt: Date,
    processingNotes: String,
    generatedLabelsCount: {
      type: Number,
      default: 0
    }
  },
  // File metadata
  metadata: {
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    lastAccessed: {
      type: Date,
      default: Date.now
    },
    downloadCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
fileSchema.index({ uploadedBy: 1, status: 1 });
fileSchema.index({ clientId: 1, status: 1 });
fileSchema.index({ fileType: 1, status: 1 });
fileSchema.index({ 'metadata.uploadedAt': -1 });

// Update lastAccessed when file is accessed
fileSchema.methods.updateAccess = function() {
  this.metadata.lastAccessed = new Date();
  this.metadata.downloadCount += 1;
  return this.save();
};

// Get file status for display
fileSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'pending': 'Awaiting Processing',
    'processing': 'In Progress',
    'completed': 'Ready for Download',
    'failed': 'Processing Failed'
  };
  return statusMap[this.status] || this.status;
});

// Get file size in human readable format
fileSchema.virtual('sizeFormatted').get(function() {
  const bytes = this.size;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Ensure virtual fields are serialized
fileSchema.set('toJSON', {
  virtuals: true
});

module.exports = mongoose.model('File', fileSchema);
