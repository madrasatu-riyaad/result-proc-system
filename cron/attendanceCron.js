
const cron = require("node-cron");
const AttendanceTracker = require("../models/attendanceTrackingModel");
const Attendances2 = require("../models/newAttendanceModel");
const Staff = require("../models/staffModel");
const CronLog = require("../models/cronLogModel");
const { SEND_NOTIFICATION_EMAIL } = require("../utils/mailHandler");

/* ================= SAFETY ================= */

process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Rejection:", err);
});

/* ================= TIME HELPERS ================= */

const hasTimePassed = (targetTime, currentTime) => {
  if (!targetTime) return false;

  const [th, tm] = targetTime.split(":").map(Number);
  const target = th * 60 + tm;

  const [ch, cm] = currentTime.split(":").map(Number);
  const current = ch * 60 + cm;

  return current >= target;
};

const daysOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const getWeekId = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((d - start) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${week}`;
};

/* ================= TERM HELPERS ================= */

const getAllTeachingDates = (startDate, endDate, teachingDays) => {
  const dates = [];

  if (!startDate) return dates;

  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayName = d.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Africa/Lagos",
    });

    if (teachingDays.includes(dayName)) {
      dates.push(new Date(d));
    }
  }

  return dates;
};

/* ================= MAIN JOB ================= */

const runAttendanceJob = async () => {
  try {
    const now = new Date();

    const localNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Africa/Lagos" })
    );

    const currentTime = localNow.toTimeString().slice(0, 5);

    const todayKey = localNow.toLocaleDateString("en-CA", {
      timeZone: "Africa/Lagos",
    });

    const todayDay = localNow.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Africa/Lagos",
    });

    const weekId = getWeekId(localNow);

    const configs = await AttendanceTracker.find({ active: true });
    const admins = await Staff.find({ role: "superadmin" });

    for (const config of configs) {

      /* ================= DAILY ================= */

      const shouldRunDaily =
        config.teachingDays.includes(todayDay) &&
        hasTimePassed(config.reminders?.endOfDay, currentTime) &&
        config.lastDailySent !== todayKey;

      if (shouldRunDaily) {
        const records = await Attendances2.find({
          programme: config.programme,
          sessionName: config.sessionName,
          termName: config.termName,
          className: { $in: config.classes },
        });

        const unmarked = [];

        for (const r of records) {
          const markedToday = r.attendanceRecord?.some((a) => {
            if (!a.termdate) return false;

            const recordKey = new Date(a.termdate).toLocaleDateString(
              "en-CA",
              { timeZone: "Africa/Lagos" }
            );

            return recordKey === todayKey;
          });

          if (!markedToday) {
            unmarked.push(r.className);
          }
        }

        if (unmarked.length > 0) {
          const html = `
            <p><b>Today's attendance is missing for the following classes</b></p>
            <ul>
              ${unmarked.map((c) => `<li>${c}</li>`).join("")}
            </ul>
          `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Daily Attendance Alert (${config.programme})`,
              html
            );
          }

          await CronLog.create({
            type: "daily",
            programme: config.programme,
            status: "success",
            message: "sent",
          });
        }

        config.lastDailySent = todayKey;
        await config.save();
      }

      /* ================= WEEKLY SUMMARY ================= */

      const reviewDay = config.teachingDays[0];

      const isWeeklyTime =
        todayDay === reviewDay &&
        hasTimePassed(config.weeklySummary?.time, currentTime);

      const shouldRunWeekly =
        (isWeeklyTime) &&
        config.lastWeeklySummarySent !== weekId;

      if (shouldRunWeekly) {

        const records = await Attendances2.find({
          programme: config.programme,
          sessionName: config.sessionName,
          termName: config.termName,
          className: { $in: config.classes },
        });

        // 🔥 compute ONCE (FIX)
        const expectedDates = getAllTeachingDates(
          config.startDate,
          localNow,
          config.teachingDays
        );

        const missing = [];

        for (const className of config.classes) {

          const record = records.find((r) => r.className === className);

          // 🔥 convert attendance to SET for O(1) lookup (BIG FIX)
          const attendanceSet = new Set(
            (record?.attendanceRecord || [])
              .filter(a => a.termdate)
              .map(a =>
                new Date(a.termdate).toLocaleDateString("en-CA", {
                  timeZone: "Africa/Lagos"
                })
              )
          );

          const missingDates = [];

          for (const date of expectedDates) {

            const dateKey = date.toLocaleDateString("en-CA", {
              timeZone: "Africa/Lagos",
            });

            if (!attendanceSet.has(dateKey)) {
              missingDates.push(dateKey);
            }
          }

          if (missingDates.length > 0) {
            missing.push({
              class: className,
              dates: missingDates,
            });
          }
        }

        if (missing.length > 0) {

          const html = `
            <div style="font-family: Arial;">
              <h3>Weekly Attendance Report</h3>
              <p style="color:#8d0404;"><b>Missing Attendance So Far: PLEASE DO THE NEEDFUL!</b></p>

              ${missing.map(item => `
                <div>
                  <p><b>${item.class}</b></p>
                  <ul>
                    ${item.dates.map((d) => {
            const dateObj = new Date(d);

            const dayName = dateObj.toLocaleDateString("en-US", {
              weekday: "long",
              timeZone: "Africa/Lagos",
            });

            return `<li>${dayName}, ${d}</li>`;
          }).join("")}
                  </ul>
                </div>
              `).join("")}

            </div>
          `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Attendance Progress Report (${config.programme})`,
              html
            );
          }

          await CronLog.create({
            type: "weekly",
            programme: config.programme,
            status: "success",
            message: "term report sent",
          });
        }

        config.lastWeeklySummarySent = weekId;
        await config.save();
      }
    }
  } catch (err) {
    console.error("❌ Attendance job error:", err);
  }
};

/* ================= CRON ================= */

let running = false;

cron.schedule("*/10 * * * *", async () => {
  if (running) return;

  running = true;

  try {
    await runAttendanceJob();
  } finally {
    running = false;
  }
});

console.log("✅ Attendance cron initialized");

module.exports = { runAttendanceJob };