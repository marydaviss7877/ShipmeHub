/**
 * Script: set-admin-balance.js
 * Sets the admin user's balance to $10,000,000 in MongoDB Atlas
 * Run once: node server/set-admin-balance.js
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Balance = require('./models/Balance');
require('dotenv').config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB Atlas');

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('❌ No admin user found. Run: node server/setup-admin.js first');
    process.exit(1);
  }

  const TEN_MILLION = 10_000_000;

  let balance = await Balance.findOne({ user: admin._id });
  if (!balance) {
    balance = new Balance({ user: admin._id, currentBalance: 0, transactions: [] });
  }

  const previous = balance.currentBalance;

  // Reset to exactly $10M
  balance.currentBalance = TEN_MILLION;
  balance.transactions.push({
    type: 'adjustment',
    amount: TEN_MILLION - previous,
    description: 'Initial admin fund — $10,000,000 master balance',
    performedBy: admin._id
  });
  balance.lastUpdated = new Date();
  await balance.save();

  console.log(`\n💰 Admin balance set to $${TEN_MILLION.toLocaleString()}`);
  console.log(`   Admin: ${admin.email}`);
  console.log(`   Previous balance: $${previous.toLocaleString()}`);
  console.log(`   New balance:      $${TEN_MILLION.toLocaleString()}\n`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
