/**
 * remove-seed-labels.js
 *
 * Deletes all dummy Label records inserted by seed-label-history.js.
 * Identification: trackingId starts with "DEMO" (set by the seed script).
 *
 * Run:  node server/remove-seed-labels.js
 *
 * Safe: real carrier tracking IDs (USPS, UPS, FedEx, DHL) never begin
 *       with the literal string "DEMO", so no real label will be touched.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Label = require('./models/Label');

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipmehub';
  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  const filter = { trackingId: /^DEMO/i };

  const count = await Label.countDocuments(filter);

  if (count === 0) {
    console.log('ℹ️   No dummy seed labels found. Nothing to delete.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`🗑   Found ${count.toLocaleString()} dummy label(s) to delete…`);

  const result = await Label.deleteMany(filter);

  console.log(`✅  Deleted ${result.deletedCount.toLocaleString()} dummy label(s).`);
  console.log('   Real labels (non-DEMO tracking IDs) are untouched.\n');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('❌  Failed:', err.message);
  process.exit(1);
});
