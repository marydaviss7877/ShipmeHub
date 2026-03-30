const mongoose = require('mongoose');

const vendorFormulaSchema = new mongoose.Schema({
  carrier: {
    type: String,
    enum: ['USPS', 'UPS', 'FedEx', 'DHL'],
    required: true,
  },
  vendorName: {
    type: String,
    required: true,
    trim: true,
  },
  incentiveThreshold: {
    type: Number,
    default: 0.40,
  },
  incentiveRsPerUnit: {
    type: Number,
    default: 1.0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

const salaryLogSchema = new mongoose.Schema({
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  year: {
    type: Number,
    required: true,
  },
  baseSalaryPaid: {
    type: Number,
    default: 0,
  },
  incentivePaid: {
    type: Number,
    default: 0,
  },
  totalPaid: {
    type: Number,
    default: 0,
  },
  note: {
    type: String,
    default: '',
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
  loggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
});

const salesAgentProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  baseSalaryPKR: {
    type: Number,
    default: 0,
  },
  incentiveThreshold: {
    type: Number,
    default: 0.40,
  },
  incentiveRsPerUnit: {
    type: Number,
    default: 1.0,
  },
  notes: {
    type: String,
    default: '',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  vendorFormulas: [vendorFormulaSchema],
  salaryLogs: [salaryLogSchema],
}, {
  timestamps: true,
});

salesAgentProfileSchema.index({ isActive: 1 });

module.exports = mongoose.model('SalesAgentProfile', salesAgentProfileSchema);
