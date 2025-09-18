const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  currentBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [{
    type: {
      type: String,
      enum: ['topup', 'deduction', 'refund', 'adjustment'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    relatedFile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      default: null
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
balanceSchema.index({ user: 1 });
balanceSchema.index({ 'transactions.createdAt': -1 });

// Method to add transaction and update balance
balanceSchema.methods.addTransaction = function(transactionData) {
  this.transactions.push(transactionData);
  
  // Update current balance based on transaction type
  if (transactionData.type === 'topup' || transactionData.type === 'refund') {
    this.currentBalance += transactionData.amount;
  } else if (transactionData.type === 'deduction') {
    this.currentBalance -= transactionData.amount;
  } else if (transactionData.type === 'adjustment') {
    this.currentBalance += transactionData.amount; // Can be positive or negative
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

// Method to get recent transactions
balanceSchema.methods.getRecentTransactions = function(limit = 10) {
  return this.transactions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
};

// Static method to get or create balance for user
balanceSchema.statics.getOrCreateBalance = async function(userId) {
  let balance = await this.findOne({ user: userId });
  
  if (!balance) {
    balance = new this({
      user: userId,
      currentBalance: 0,
      transactions: []
    });
    await balance.save();
  }
  
  return balance;
};

module.exports = mongoose.model('Balance', balanceSchema);
