const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title:    { type: String, required: true, trim: true },
  content:  { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['general', 'service', 'pricing', 'maintenance'],
    default: 'general',
  },
  isPinned: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
