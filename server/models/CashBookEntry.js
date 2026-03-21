const mongoose = require('mongoose');

const cashBookEntrySchema = new mongoose.Schema(
  {
    entryType: {
      type: String,
      enum: ['debit', 'credit'],
      required: true,
    },
    amountPKR: {
      type: Number,
      required: true,
      min: 0,
    },
    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isAutoEntry: {
      type: Boolean,
      default: false,
    },
    sourceRef: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

cashBookEntrySchema.index({ date: -1 });

module.exports = mongoose.model('CashBookEntry', cashBookEntrySchema);
