const mongoose = require('mongoose');

const salesConfigSchema = new mongoose.Schema({
  usdToPkrRate: {
    type: Number,
    default: 280,
  },
  defaultThreshold: {
    type: Number,
    default: 0.40,
  },
  defaultRsPerUnit: {
    type: Number,
    default: 1.0,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

/**
 * Returns the single global config document.
 * Creates it with defaults if it does not yet exist.
 */
salesConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model('SalesConfig', salesConfigSchema);
