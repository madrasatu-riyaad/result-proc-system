
const AttendanceTracker = require("../models/attendanceTrackingModel"); 


const submitDetails = async (req, res, next) => {
  try {
    const {
      programme,
      classes,
      sessionName,
      termName,
      startDate,
      endDate,
      teachingDays,
      reminders,
      active
    } = req.body;

    console.log("Attendance config received:", req.body);

    // Check if this exact programme/session/term already exists
    const existingConfig = await AttendanceTracker.findOne({
      programme,
      sessionName,
      termName
    });

    if (existingConfig) {
      return res.status(400).json({
        status: "fail",
        message:
          "Configuration already exists for this programme/session/term"
      });
    }

    // Make all previous configurations for this programme non-current
    await AttendanceTracker.updateMany(
      { programme },
      { $set: { isCurrent: false } }
    );

    // Create the new current configuration
    const newConfig = await AttendanceTracker.create({
      programme,
      classes: classes || [],
      sessionName,
      termName,
      isCurrent: true,
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

    return res.status(201).json({
      status: "success",
      message: "Attendance configuration saved successfully",
      data: newConfig
    });

  } catch (error) {
    console.error("Error in submitDetails:", error);

    return res.status(500).json({
      status: "error",
      message: "Server error while submitting attendance config"
    });
  }
};


module.exports = { submitDetails }