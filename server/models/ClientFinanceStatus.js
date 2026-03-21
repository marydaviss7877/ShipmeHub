const mongoose = require('mongoose');

/**
 * ClientFinanceStatus — records the admin-set status and note for each
 * client × carrier × month × year combination on the Finance page.
 *
 * Status is purely for documentation — it does not block any functionality.
 */
const clientFinanceStatusSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  carrier: {
    type: String,
    enum: ['USPS', 'UPS', 'FedEx', 'DHL'],
    required: true,
  },
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
  status: {
    type: String,
    enum: ['Clear', 'Pending', 'Outstanding', 'Blocked'],
    default: 'Pending',
  },
  note: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

// One status record per client-carrier-month-year
clientFinanceStatusSchema.index({ client: 1, carrier: 1, month: 1, year: 1 }, { unique: true });
clientFinanceStatusSchema.index({ month: 1, year: 1 });

module.exports = mongoose.model('ClientFinanceStatus', clientFinanceStatusSchema);
