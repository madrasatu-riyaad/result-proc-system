const cron = require("node-cron");
const Attendances2 = require("../models/newAttendanceModel");
const AttendanceTracker = require("../models/attendanceTrackingModel");
const Staff = require("../models/staffModel");
const { SEND_NOTIFICATION_EMAIL } = require("../utils/mailHandler");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let lastBreakNotice = {};
let lastEndDayNotice = {};
let breakWarnedClasses = {};

// Reset daily trackers at midnight Lagos time
const resetDailyTracking = () => {
  const now = new Date();
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  if (localNow.getHours() === 0 && localNow.getMinutes() === 0) {
    lastBreakNotice = {};
    lastEndDayNotice = {};
    breakWarnedClasses = {};
  }
};

// Helper: check if a date is today (UTC-safe)
const isTodayUTC = (date, localNow) => {
  return (
    date.getUTCFullYear() === localNow.getUTCFullYear() &&
    date.getUTCMonth() === localNow.getUTCMonth() &&
    date.getUTCDate() === localNow.getUTCDate()
  );
};

const runAttendanceReminder = async () => {
  try {
    // ---------- STEP 3a: Supabase heartbeat ----------
    try {
      const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000; // 5 days
      const { data: meta, error } = await supabase
        .from("system_meta")
        .select("last_seen")
        .eq("id", 1)
        .single();

      const lastSeen = meta?.last_seen ? new Date(meta.last_seen) : null;
      const now = new Date();

      if (!lastSeen || (now - lastSeen) > FIVE_DAYS) {
        const { data, error } = await supabase
          .from("system_meta")
          .upsert({
            id: 1,
            last_seen: now.toISOString(),
            source: "attendance_cron"
          });

        if (error) console.error("Supabase heartbeat failed:", error.message);
        else console.log("✅ Supabase heartbeat sent successfully");
      } else {
        console.log("Supabase heartbeat not needed yet. Last seen:", lastSeen);
      }
    } catch (e) {
      console.error("Supabase heartbeat error:", e.message);
    }
    resetDailyTracking();

    const now = new Date();

    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    const currentTime = localNow.toTimeString().slice(0, 5);
    const todayString = localNow.toDateString();

    const configs = await AttendanceTracker.find({ active: true });
    const superadmins = await Staff.find({ role: "superadmin" });

    const summary = [];

    for (const config of configs) {
      const todayDay = localNow.toLocaleDateString("en-US", { weekday: "long" });
      if (!config.teachingDays.includes(todayDay)) continue;

      const reminderTypes = [];
      if (config.reminders.breakTime === currentTime) reminderTypes.push("break");
      if (config.reminders.endOfDay === currentTime) reminderTypes.push("endOfDay");
      if (!reminderTypes.length) continue;

      // Fetch attendance docs for this programme and class
      const attendanceDocs = await Attendances2.find({
        programme: config.programme,
        sessionName: config.sessionName,
        termName: config.termName,
        className: { $in: config.classes },
      }).select("className attendanceRecord");

      const attendanceMap = {};
      for (const doc of attendanceDocs) {
        const todayRecord = doc.attendanceRecord.find((r) =>
          isTodayUTC(new Date(r.termdate), localNow)
        );
        if (todayRecord) attendanceMap[doc.className] = true;
      }

      const unmarkedClasses = config.classes.filter((c) => !attendanceMap[c]);
      if (!unmarkedClasses.length) continue;

      for (const type of reminderTypes) {
        if (type === "break") {
          if (lastBreakNotice[config.programme] === todayString) continue;

          const subject = `Break-time Attendance Reminder (${config.programme})`;
          const html = `
            <p>The following classes have not marked attendance today:</p>
            <ul>${unmarkedClasses.map((c) => `<li>${c}</li>`).join("")}</ul>
            <p>Please follow up with the teachers.</p>
          `;

          for (const admin of superadmins) {
            await SEND_NOTIFICATION_EMAIL(admin.email, subject, html);
          }

          lastBreakNotice[config.programme] = todayString;
          breakWarnedClasses[config.programme] = [...unmarkedClasses];

          summary.push({
            programme: config.programme,
            type: "Break-time",
            unmarked: unmarkedClasses.length,
          });
        }

        if (type === "endOfDay") {
          if (lastEndDayNotice[config.programme] === todayString) continue;

          const remainingClasses = unmarkedClasses.filter(
            (c) => breakWarnedClasses[config.programme]?.includes(c)
          );
          if (!remainingClasses.length) continue;

          const subject = `End-of-day Attendance Reminder (${config.programme})`;
          const html = `
            <p>The following classes still have not marked attendance today:</p>
            <ul>${remainingClasses.map((c) => `<li>${c}</li>`).join("")}</ul>
            <p>Please follow up with the teachers before the day ends.</p>
          `;

          for (const admin of superadmins) {
            await SEND_NOTIFICATION_EMAIL(admin.email, subject, html);
          }

          lastEndDayNotice[config.programme] = todayString;

          summary.push({
            programme: config.programme,
            type: "End-of-day",
            unmarked: remainingClasses.length,
          });
        }
      }
    }

    // Daily console summary
    if (summary.length) {
      console.log(
        `Attendance reminders sent at ${currentTime} Lagos time:\n`,
        summary.map((s) => `${s.type} — ${s.programme}: ${s.unmarked} unmarked classes`).join("\n")
      );
    }
  } catch (err) {
    console.error("Attendance reminder error:", err);
  }
};

// Run every 10 minutes
cron.schedule("*/10 * * * *", runAttendanceReminder);
