const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  termdate: {
    type: Date,
    required: true
  },
  attendance: {
    type: Map,
    of: Boolean
  }
});

// Pre-save hook for attendanceRecord to normalize termdate
attendanceRecordSchema.pre('save', function (next) {
  if (this.termdate) {
    this.termdate.setUTCHours(0, 0, 0, 0); // normalize to midnight UTC
  }
  next();
});

// Main attendance schema
const newAttendanceSchema = new mongoose.Schema(
  {
    programme: String,
    sessionName: String,
    termName: String,
    className: String,
    attendanceRecord: [attendanceRecordSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Attendances2', newAttendanceSchema);