const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  agent:    { type: mongoose.Schema.Types.ObjectId, ref: 'SalesAgentProfile', required: true },
  date:     { type: Date, required: true },   // midnight UTC of the calendar day

  status: {
    type: String,
    enum: ['present', 'late', 'half_day', 'absent', 'on_leave'],
    required: true,
  },

  checkInTime: { type: Date },      // actual timestamp when check-in happened
  checkInIP:   { type: String },

  markedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedByRole: { type: String, enum: ['self', 'admin'], default: 'self' },

  adminNote:    { type: String, default: '' },

  // PKR deduction snapshot — calculated at time of marking, stored for fast queries
  deductionPKR: { type: Number, default: 0 },
}, { timestamps: true });

// One record per agent per day
attendanceRecordSchema.index({ agent: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
