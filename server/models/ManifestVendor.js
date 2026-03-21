const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const payoutSchema = new mongoose.Schema({
  amount:    { type: Number, required: true },
  note:      { type: String, default: '' },
  paidAt:    { type: Date, default: Date.now },
  paidBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const manifestVendorSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, select: false },   // bcrypt-hashed portal password
  notifyEmail: { type: String, default: '' },    // email for job notifications (if different)

  // ── Carriers this vendor supports ───────────────────────────
  carriers: {
    type: [{ type: String, enum: ['USPS', 'UPS', 'FedEx', 'DHL'] }],
    default: [],
  },

  // ── Rates ────────────────────────────────────────────────────
  vendorRate: { type: Number, default: 0, min: 0 }, // per-label rate paid to vendor

  // ── KPI stats (auto-tracked) ─────────────────────────────────
  stats: {
    totalJobs:      { type: Number, default: 0 },
    onTimeUploads:  { type: Number, default: 0 },   // uploaded within SLA
    lateUploads:    { type: Number, default: 0 },
    completedJobs:  { type: Number, default: 0 },
    rejectedJobs:   { type: Number, default: 0 },   // admin rejected upload
    totalLabels:    { type: Number, default: 0 },
  },

  // ── Score override (admin can set 1-5) ───────────────────────
  scoreOverride: { type: Number, default: null, min: 1, max: 5 },

  // ── Financials ───────────────────────────────────────────────
  payableBalance: { type: Number, default: 0 },   // what we owe vendor right now
  totalPaidOut:   { type: Number, default: 0 },   // cumulative payouts
  payouts:        [payoutSchema],

  // ── Status & meta ────────────────────────────────────────────
  isActive:   { type: Boolean, default: true },
  lastLogin:  { type: Date, default: null },
  description: { type: String, default: '' },

}, { timestamps: true });

// ── Computed score virtual ────────────────────────────────────
manifestVendorSchema.virtual('score').get(function () {
  if (this.scoreOverride !== null && this.scoreOverride !== undefined) {
    return this.scoreOverride;
  }
  const s = this.stats;
  const totalTracked = (s.onTimeUploads || 0) + (s.lateUploads || 0);
  if (totalTracked === 0 || s.totalJobs === 0) return null;

  const onTimeRate  = s.onTimeUploads  / totalTracked;
  const errorRate   = s.rejectedJobs   / s.totalJobs;
  const raw         = (onTimeRate * 0.6 + (1 - errorRate) * 0.4) * 5;
  return Math.round(raw * 2) / 2; // round to nearest 0.5
});

manifestVendorSchema.set('toJSON',   { virtuals: true });
manifestVendorSchema.set('toObject', { virtuals: true });

// ── Password hashing pre-save ────────────────────────────────
manifestVendorSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance method to compare password ──────────────────────
manifestVendorSchema.methods.comparePassword = async function (plain) {
  if (!this.password) return false;
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('ManifestVendor', manifestVendorSchema);
