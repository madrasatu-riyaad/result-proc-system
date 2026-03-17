const mongoose = require("mongoose");

const attendanceTrackingSchema = new mongoose.Schema({
  programme: String,
  classes: [String],
  sessionName: String,
  termName: String,
  startDate: Date,
  endDate: Date,
  teachingDays: [String],
  reminders: {
    firstReminder: String,
    breakTime: String,
    endOfDay: String
  },
  active: Boolean
}, { timestamps: true });

module.exports = mongoose.model("AttendanceTracking", attendanceTrackingSchema);