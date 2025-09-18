const mongoose = require('mongoose');

const rateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  labelRate: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD']
  },
  setBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: 500
  },
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveTo: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
rateSchema.index({ user: 1, isActive: 1 });
rateSchema.index({ effectiveFrom: -1 });

// Method to deactivate current rate
rateSchema.methods.deactivate = function() {
  this.isActive = false;
  this.effectiveTo = new Date();
  return this.save();
};

// Static method to get current active rate for user
rateSchema.statics.getCurrentRate = async function(userId) {
  const rate = await this.findOne({
    user: userId,
    isActive: true,
    effectiveFrom: { $lte: new Date() },
    $or: [
      { effectiveTo: null },
      { effectiveTo: { $gt: new Date() } }
    ]
  }).sort({ effectiveFrom: -1 });
  
  return rate;
};

// Static method to set new rate for user
rateSchema.statics.setRate = async function(userId, labelRate, setBy, notes = '') {
  // Deactivate current rate if exists
  const currentRate = await this.getCurrentRate(userId);
  if (currentRate) {
    await currentRate.deactivate();
  }
  
  // Create new rate
  const newRate = new this({
    user: userId,
    labelRate,
    setBy,
    notes,
    effectiveFrom: new Date()
  });
  
  return newRate.save();
};

module.exports = mongoose.model('Rate', rateSchema);
