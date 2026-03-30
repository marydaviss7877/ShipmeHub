const mongoose = require('mongoose');

const attendanceConfigSchema = new mongoose.Schema({
  // Shift settings
  workingDaysPerMonth: { type: Number, default: 26 },
  shiftStartTime:      { type: String, default: '09:00' },   // HH:MM (24h)
  lateGraceMinutes:    { type: Number, default: 15 },         // minutes after shift start before "late"
  halfDayThresholdTime:{ type: String, default: '13:00' },   // check-in after this = half_day

  // Salary
  baseSalaryPKR: { type: Number, default: 30000 },

  // Absent penalty: 'auto' = baseSalary / workingDays, 'fixed' = absentPenaltyPKR
  absentPenaltyMode:   { type: String, enum: ['auto', 'fixed'], default: 'auto' },
  absentPenaltyPKR:    { type: Number, default: 0 },

  // Half-day penalty: 'auto' = absentPenalty / 2, 'fixed' = halfDayPenaltyPKR
  halfDayPenaltyMode:  { type: String, enum: ['auto', 'fixed'], default: 'auto' },
  halfDayPenaltyPKR:   { type: Number, default: 0 },

  // Late penalty: flat amount per late occurrence
  latePenaltyPKR:      { type: Number, default: 200 },

  // Paid leaves before deductions kick in
  paidLeavesPerMonth:  { type: Number, default: 1 },

  // Office IP whitelist — empty array means no restriction (useful during setup)
  allowedIPs: [{ type: String }],

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Singleton — always one config document
attendanceConfigSchema.statics.getConfig = async function () {
  let cfg = await this.findOne();
  if (!cfg) cfg = await this.create({});
  return cfg;
};

module.exports = mongoose.model('AttendanceConfig', attendanceConfigSchema);
