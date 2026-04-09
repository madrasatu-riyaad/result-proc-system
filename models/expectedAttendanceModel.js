const mongoose = require("mongoose");

const expectedAttendanceSchema = new mongoose.Schema(
  {
    programme: String,
    sessionName: String,
    termName: String,
    className: String,
    date: Date,
    marked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExpectedAttendance", expectedAttendanceSchema);