const mongoose = require('mongoose');

const paymentLogSchema = new mongoose.Schema({
  // Which user this payment was received from / credited to
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Payment amount
  amount: {
    type: Number,
    required: true,
    min: 0,
  },

  // Date the payment was actually received (not necessarily createdAt)
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },

  // Optional note / memo
  note: {
    type: String,
    default: '',
    trim: true,
  },

  // Uploaded screenshot file paths (relative to /uploads/payment-screenshots/)
  screenshots: {
    type: [String],
    default: [],
  },

  // Who logged this entry
  loggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Which wallet the payment was deposited into (only for sales-agent clients)
  wallet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    default: null,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('PaymentLog', paymentLogSchema);
