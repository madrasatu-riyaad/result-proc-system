const mongoose = require('mongoose')

const attendanceTrackingSchema = new mongoose.Schema(
  {
    programme: String,
    classes: [String],

    sessionName: String,
    termName: String,

    // ✅ NEW: ACTIVE CONTEXT FOR THIS PROGRAMME
    currentSessionName: String,
    currentTermName: String,
    isCurrent: { type: Boolean, default: true },

    startDate: Date,
    endDate: Date,

    teachingDays: [String],

    reminders: {
      firstReminder: String,
      breakTime: String,
      endOfDay: String,
    },

    weeklySummary: {
      time: {
        type: String,
        default: "08:00",
      },
    },

    lastDailySent: String,
    lastWeeklySummarySent: String,
    active: Boolean,
  },
  { timestamps: true }
);

module.exports = mongoose.model("AttendanceTracking", attendanceTrackingSchema);