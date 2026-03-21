/**
 * seed-label-history.js
 *
 * Inserts realistic dummy Label records for the past 6 months so the
 * admin graph looks populated.  Skips any day that already has Label
 * documents (so today-onward real data is NEVER touched or duplicated).
 *
 * Run once:
 *   node server/seed-label-history.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User  = require('./models/User');
const Label = require('./models/Label');

// ── Carrier / vendor config ───────────────────────────────────────────────────
const CARRIERS = [
  {
    name:    'USPS',
    vendors: ['USPS Priority Mail – EasyPost', 'USPS Ground Advantage – ShipHub', 'USPS First Class – PitneyBowes'],
    baseDay: 52,   // avg labels / weekday
  },
  {
    name:    'UPS',
    vendors: ['UPS Ground – EasyPost', 'UPS 2-Day Air – ShipHub'],
    baseDay: 18,
  },
  {
    name:    'FedEx',
    vendors: ['FedEx Ground – EasyPost', 'FedEx Express Saver – ShipHub'],
    baseDay: 14,
  },
  {
    name:    'DHL',
    vendors: ['DHL eCommerce – EasyPost', 'DHL Express – ShipHub'],
    baseDay: 8,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const rand     = (min, max) => Math.random() * (max - min) + min;
const randInt  = (min, max) => Math.floor(rand(min, max + 1));
const pick     = (arr)      => arr[Math.floor(Math.random() * arr.length)];

/** Sinusoidal growth trend: older dates slightly fewer labels */
function trendMultiplier(daysAgo, totalDays) {
  // 0.55 → 1.0 linear growth over the period
  return 0.55 + (1 - daysAgo / totalDays) * 0.45;
}

/** Weekend factor */
function weekdayMultiplier(date) {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow === 0) return 0.18;
  if (dow === 6) return 0.25;
  return 1;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/shipmehub';
  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB');

  // Find any admin user to attach labels to
  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('❌  No admin user found — run setup-admin.js first');
    process.exit(1);
  }
  console.log(`👤  Seeding labels owned by: ${admin.email}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const DAYS_BACK = 180; // 6 months

  // Find which days already have ANY Label documents so we skip them
  const existingDates = await Label.aggregate([
    {
      $match: {
        createdAt: { $lt: today },
      },
    },
    {
      $group: {
        _id: {
          y: { $year:  '$createdAt' },
          m: { $month: '$createdAt' },
          d: { $dayOfMonth: '$createdAt' },
        },
      },
    },
  ]);

  const skipKeys = new Set(
    existingDates.map(({ _id: { y, m, d } }) =>
      `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    )
  );

  console.log(`⏭   Already have data for ${skipKeys.size} past day(s) — skipping those`);

  // Build all documents
  const docs = [];

  for (let daysAgo = DAYS_BACK; daysAgo >= 1; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);

    const dateKey = date.toISOString().slice(0, 10);
    if (skipKeys.has(dateKey)) continue;

    const trend   = trendMultiplier(daysAgo, DAYS_BACK);
    const wdMult  = weekdayMultiplier(date);

    for (const carrier of CARRIERS) {
      // Random daily count influenced by trend + weekday + noise
      const noise = rand(0.75, 1.28);
      const count = Math.max(0, Math.round(carrier.baseDay * trend * wdMult * noise));

      for (let i = 0; i < count; i++) {
        const vendor  = pick(carrier.vendors);
        const hour    = randInt(7, 19);   // 7 am – 7 pm
        const minute  = randInt(0, 59);
        const second  = randInt(0, 59);

        const ts = new Date(date);
        ts.setHours(hour, minute, second, randInt(0, 999));

        docs.push({
          user:            admin._id,
          carrier:         carrier.name,
          vendorName:      vendor,
          shippingService: 'Standard',
          trackingId:      `DEMO${carrier.name.slice(0,2)}${ts.getTime().toString(36).toUpperCase()}${i}`,
          from_name:       'Demo Shipper',
          from_address1:   `${randInt(100, 9999)} Maple St`,
          from_city:       'New York',
          from_state:      'NY',
          from_zip:        '10001',
          to_name:         'Demo Recipient',
          to_address1:     `${randInt(100, 9999)} Oak Ave`,
          to_city:         'Los Angeles',
          to_state:        'CA',
          to_zip:          '90001',
          weight:          Math.round(rand(0.3, 25) * 10) / 10,
          price:           Math.round(rand(0.45, 4.5) * 100) / 100,
          status:          'generated',
          isBulk:          Math.random() > 0.65,
          bulkJobId:       Math.random() > 0.65 ? `bulk-demo-${daysAgo}` : null,
          // Timestamps set explicitly — use collection.insertMany to bypass Mongoose auto-timestamp
          createdAt:       ts,
          updatedAt:       ts,
        });
      }
    }
  }

  if (docs.length === 0) {
    console.log('ℹ️   Nothing to insert — all past days already have data.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`📦  Inserting ${docs.length.toLocaleString()} demo label records…`);

  // Use raw collection to preserve our custom createdAt values
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    await Label.collection.insertMany(docs.slice(i, i + CHUNK), { ordered: false });
    inserted += Math.min(CHUNK, docs.length - i);
    process.stdout.write(`\r   ${inserted.toLocaleString()} / ${docs.length.toLocaleString()}`);
  }

  console.log('\n✅  Seed complete!');
  console.log(`   Total inserted : ${docs.length.toLocaleString()}`);
  console.log(`   Date range     : ${new Date(today.getTime() - DAYS_BACK * 86400000).toDateString()} → yesterday`);
  console.log('   Real data from today is untouched.\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌  Seed failed:', err.message);
  process.exit(1);
});
