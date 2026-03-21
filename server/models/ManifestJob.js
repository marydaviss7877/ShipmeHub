const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
  status:            { type: String },
  note:              { type: String },
  performedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  byVendor:          { type: Boolean, default: false },
  timestamp:         { type: Date, default: Date.now },
}, { _id: false });

const billingBreakdownSchema = new mongoose.Schema({
  rate:     Number,
  count:    Number,
  subtotal: Number,
}, { _id: false });

const manifestJobSchema = new mongoose.Schema({

  // ── Core ──────────────────────────────────────────────────
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User',           required: true },
  carrier:        { type: String, enum: ['USPS', 'UPS', 'FedEx', 'DHL'],         required: true },
  vendor:         { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor',          default: null },
  assignedVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestVendor',  default: null },

  // ── Status ────────────────────────────────────────────────
  // open         → broadcast to all matching vendors; any can claim it
  // assigned     → a vendor claimed the job (can download CSV, start work)
  // accepted     → vendor explicitly confirmed (legacy / manual assignment flow)
  // uploaded     → vendor uploaded result ZIP (cooling period active)
  // under_review → cooling passed, waiting admin approval
  // completed    → admin approved, user notified
  // cancelled    → job cancelled (can be resubmitted)
  // rejected     → admin rejected vendor upload (vendor must re-upload)
  status: {
    type: String,
    enum: ['open', 'assigned', 'accepted', 'uploaded', 'under_review', 'completed', 'cancelled', 'rejected'],
    default: 'open',
  },

  // ── Request file (uploaded by user) ───────────────────────
  requestFile: {
    originalName: String,
    storedName:   String,
    path:         String,
    labelCount:   { type: Number, default: 0 },
  },

  // ── Result file (uploaded by vendor) ──────────────────────
  resultFile: {
    originalName:    String,
    storedName:      String,
    path:            String,
    uploadedAt:      Date,
    coolingDeadline: Date,   // vendor can cancel upload within 1 min
  },

  // ── User billing (deducted at submission, tier-based) ─────
  userBilling: {
    labelCount:  { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    deducted:    { type: Boolean, default: false },
    deductedAt:  Date,
    breakdown:   [billingBreakdownSchema],
  },

  // ── Vendor earning (credited when admin approves) ─────────
  vendorEarning: {
    ratePerLabel: { type: Number, default: 0 },
    labelCount:   { type: Number, default: 0 },
    totalAmount:  { type: Number, default: 0 },
    credited:     { type: Boolean, default: false },
    creditedAt:   Date,
  },

  // ── Timestamps for key events ─────────────────────────────
  assignedAt:        Date,
  acceptedAt:        Date,
  vendorUploadedAt:  Date,
  adminReviewedAt:   Date,
  completedAt:       Date,
  cancelledAt:       Date,
  cancelledBy:       { type: String, enum: ['admin', 'vendor', 'user', null], default: null },
  cancellationReason: String,
  rejectionReason:   String,
  adminNotes:        String,

  // ── Audit trail ───────────────────────────────────────────
  timeline: [timelineEventSchema],

}, { timestamps: true });

manifestJobSchema.index({ user: 1, status: 1 });
manifestJobSchema.index({ assignedVendor: 1, status: 1 });
manifestJobSchema.index({ carrier: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ManifestJob', manifestJobSchema);
