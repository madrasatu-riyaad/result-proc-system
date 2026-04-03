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

const getReviewDay = (teachingDays) => {
  if (!teachingDays || teachingDays.length === 0) return null;

  const sorted = [...teachingDays].sort(
    (a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b),
  );

  const firstTeachingDay = sorted[0];
  const index = daysOrder.indexOf(firstTeachingDay);

  return daysOrder[(index - 1 + 7) % 7];
};

const getWeekId = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const days = Math.floor((d - start) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${year}-W${week}`;
};

/* ================= MAIN JOB ================= */

const runAttendanceJob = async () => {
  try {
    const now = new Date();

    const localNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }),
    );

    const currentTime = localNow.toTimeString().slice(0, 5);
    const today = localNow.toLocaleDateString("en-US", {
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
        config.lastDailySent !== today;

      if (shouldRunDaily) {
        const records = await Attendances2.find({
          programme: config.programme,
          sessionName: config.sessionName,
          termName: config.termName,
          className: { $in: config.classes },
        });

        const unmarked = [];

        for (const r of records) {
          const markedToday = r.attendanceRecord.some((a) => {
            const d = new Date(a.termdate).toLocaleDateString("en-US", {
              timeZone: "Africa/Lagos",
            });

            return d === today;
          });

          if (!markedToday) unmarked.push(r.className);
        }

        if (unmarked.length) {
          const html = `
            <p><b>Today's attendance missing for the following classes</b></p>
            <ul>
              ${unmarked.map((c) => `<li>${c}</li>`).join("")}
            </ul>
          `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Daily Attendance Alert (${config.programme})`,
              html,
            );

            await CronLog.create({
              type: "daily",
              programme: config.programme,
              status: "success",
              message: "sent",
            });
          }
        }

        config.lastDailySent = today;
        await config.save();
      }

      /* ================= WEEKLY ================= */

      const reviewDay = getReviewDay(config.teachingDays);

      const shouldRunWeekly =
        todayDay === reviewDay &&
        hasTimePassed(config.weeklySummary?.time, currentTime) &&
        config.lastWeeklySummarySent !== weekId;

      if (shouldRunWeekly) {
        const records = await Attendances2.find({
          programme: config.programme,
          sessionName: config.sessionName,
          termName: config.termName,
        });

        const missing = [];

        for (const className of config.classes) {
          const record = records.find((r) => r.className === className);

          if (!record) {
            missing.push({
              class: className,
              days: [...config.teachingDays],
            });
            continue;
          }

          const missedDays = [];
          const attendance = record.attendanceRecord || [];

          for (const day of config.teachingDays) {
            const found = attendance.some((a) => {
              if (!a.termdate) return false;

              const recordedDay = new Date(a.termdate).toLocaleDateString(
                "en-US",
                {
                  weekday: "long",
                  timeZone: "Africa/Lagos",
                },
              );

              return recordedDay === day;
            });

            if (!found) {
              missedDays.push(day);
            }
          }

          if (missedDays.length > 0) {
            missing.push({
              class: className,
              days: missedDays,
            });
          }
        }

        // console.log("FINAL MISSING RESULT:", JSON.stringify(missing, null, 2));

        if (missing.length > 0) {
          const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h3>Attendance Report for Last Week</h3>

              ${missing.length === 0
              ? `<p>✅ All classes are fully marked for the week.</p>`
              : `
                  <p style="color: #8d0404;">
                  <b>These classes have missing attendance records. Please follow up.</b>
                  </p>
                ${missing
                .map(
                  (item) => `
                <div style="margin-bottom: 15px;">
                  <p><b>Class:</b> ${item.class}</p>
                  <p><b>Missing Days:</b></p>
                  <ul>
                    ${item.days.map((d) => `<li>${d}</li>`).join("")}
                  </ul>
                </div>
                `,
                )
                .join("")}
              `
            }
            <hr/>
            <small>This is an automated attendance report.</small>
          </div>
        `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Weekly Attendance Summary (${config.programme})`,
              html,
            );

            await CronLog.create({
              type: "weekly",
              programme: config.programme,
              status: "success",
              message: "sent",
            });
          }
        }

        config.lastWeeklySummarySent = weekId;
        await config.save();
      }
    }
  } catch (err) {
    console.error("❌ Attendance job error:", err.message);
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
