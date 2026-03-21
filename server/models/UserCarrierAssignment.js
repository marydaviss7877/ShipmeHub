const mongoose = require('mongoose');

// Pre-configured routing: which vendor handles a specific carrier for a specific user.
// When a user submits a manifested label file for carrier X,
// the system looks up this table to auto-assign the job to the right vendor.
const userCarrierAssignmentSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
  carrier:    { type: String, enum: ['USPS', 'UPS', 'FedEx', 'DHL'], required: true },
  vendor:     { type: mongoose.Schema.Types.ObjectId, ref: 'ManifestVendor', required: true },
  isActive:   { type: Boolean, default: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes:      { type: String, default: '' },
}, { timestamps: true });

// Only one active assignment per user per carrier
userCarrierAssignmentSchema.index({ user: 1, carrier: 1 });

module.exports = mongoose.model('UserCarrierAssignment', userCarrierAssignmentSchema);
