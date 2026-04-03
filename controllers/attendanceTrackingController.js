// routes/attendanceConfig.js
const AttendanceTracker = require("../models/attendanceTrackingModel"); // your Mongoose model


const submitDetails = async (req, res, next) => {
  try {
    const {
      programme,
      classes, // array from frontend
      sessionName,
      termName,
      startDate,
      endDate,
      teachingDays,
      reminders,
      active
    } = req.body;

    console.log("Attendance config received:", req.body);

    // Check if a config already exists for this programme/session/term
    const existingConfig = await AttendanceTracker.findOne({
      programme,
      sessionName,
      termName
    });

    if (existingConfig) {
      return res.status(400).json({
        status: "fail",
        message: "Configuration already exists for this programme/session/term"
      });
    }

    // Create the new config
    const newConfig = await AttendanceTracker.create({
      programme,
      classes: classes || [],
      sessionName,
      termName,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      teachingDays: teachingDays || [],
      reminders: {
        firstReminder: reminders?.firstReminder || null,
        breakTime: reminders?.breakTime || null,
        endOfDay: reminders?.endOfDay || null
      },
      weeklySummary: reminders?.weeklyTime
        ? { time: reminders.weeklyTime }
        : undefined,
      active: active !== undefined ? active : true
    });

    res.status(201).json({
      status: "success",
      data: newConfig
    });

  } catch (error) {
    console.error("Error in submitDetails:", error);
    res.status(500).json({
      status: "error",
      message: "Server error while submitting attendance config"
    });
  }
};




module.exports = { submitDetails }