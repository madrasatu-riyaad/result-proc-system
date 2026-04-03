const mongoose = require("mongoose");

const attendanceTrackingSchema = new mongoose.Schema(
  {
    programme: String,
    classes: [String],
    sessionName: String,
    termName: String,

    startDate: Date,
    endDate: Date,

    teachingDays: [String],

    reminders: {
      firstReminder: String,
      breakTime: String, // kept for future use
      endOfDay: String,
    },

    weeklySummary: {
      time: {
        type: String,
        default: "18:15"
      }
    },

    // SYSTEM TRACKING (DO NOT SET FROM FRONTEND)
    lastDailySent: String, // YYYY-MM-DD
    lastWeeklySummarySent: String, // YYYY-WW
    active: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendanceTracking", attendanceTrackingSchema);