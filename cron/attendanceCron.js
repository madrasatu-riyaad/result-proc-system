const cron = require("node-cron");
const AttendanceTracker = require("../models/attendanceTrackingModel");
const Attendances2 = require("../models/newAttendanceModel");
const Staff = require("../models/staffModel");
const CronLog = require("../models/cronLogModel");
const { SEND_NOTIFICATION_EMAIL } = require("../utils/mailHandler");

/* ================= GLOBAL LOCK ================= */
let running = false;

/* ================= TIME HELPERS ================= */

const hasTimePassed = (targetTime, currentTime) => {
  if (!targetTime) return false;

  const [th, tm] = targetTime.split(":").map(Number);
  const target = th * 60 + tm;

  const [ch, cm] = currentTime.split(":").map(Number);
  const current = ch * 60 + cm;

  return current >= target;
};

/* ================= DATE HELPERS ================= */

const getAllTeachingDates = (startDate, endDate, teachingDays) => {
  const dates = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Africa/Lagos",
    }).toLowerCase();

    if (teachingDays.includes(day)) {
      const clean = new Date(d);
      clean.setHours(0, 0, 0, 0);
      dates.push(clean);
    }
  }

  return dates;
};

/* ================= MAIN JOB ================= */

const runAttendanceJob = async () => {
  if (running) return;
  running = true;

  try {
    // console.log("▶️ Job started:", new Date().toISOString());

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" })
    );

    const currentTime = now.toTimeString().slice(0, 5);

    const todayKey = now.toLocaleDateString("en-CA", {
      timeZone: "Africa/Lagos",
    });

    const todayDay = now
      .toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: "Africa/Lagos",
      })
      .toLowerCase();

    const configs = await AttendanceTracker.find({ active: true });
    const admins = await Staff.find({ role: "superadmin" });

    for (const config of configs) {
      const teachingDays = config.teachingDays.map((d) => d.toLowerCase());

      /* ================= DAILY ================= */
      const isTeachingDay = teachingDays.includes(todayDay);

      const shouldRunDaily =
        isTeachingDay &&
        hasTimePassed(config.reminders?.endOfDay, currentTime) &&
        config.lastDailySent !== todayKey;

      /* ================= WEEKLY ================= */
      const daysOrder = [
        "monday", "tuesday", "wednesday",
        "thursday", "friday", "saturday", "sunday"
      ];

      const sortedDays = teachingDays.sort(
        (a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b)
      );

      const lastTeachingDay = sortedDays[sortedDays.length - 1];
      const nextDay =
        daysOrder[(daysOrder.indexOf(lastTeachingDay) + 1) % 7];

      const shouldRunWeekly =
        todayDay === nextDay &&
        hasTimePassed(config.weeklySummary?.time, currentTime) &&
        config.lastWeeklySummarySent !== todayKey;

      /* ================= DAILY EXECUTION ================= */
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
            <p><b>Today's attendance missing:</b></p>
            <ul>${unmarked.map(c => `<li>${c}</li>`).join("")}</ul>
          `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Daily Attendance Alert (${config.programme})`,
              html,
              {
                type: "daily",
                programme: config.programme,
                dateKey: todayKey
              }
            );
          }

          await CronLog.create({
            type: "daily",
            programme: config.programme,
            status: "success",
          });
        }

        config.lastDailySent = todayKey;
        await config.save();
      }

      /* ================= WEEKLY EXECUTION ================= */
      if (shouldRunWeekly) {
        const records = await Attendances2.find({
          programme: config.programme,
          sessionName: config.sessionName,
          termName: config.termName,
          className: { $in: config.classes },
        });

        const expectedDates = getAllTeachingDates(
          config.startDate,
          now,
          teachingDays
        );

        const missing = [];

        for (const className of config.classes) {
          const record = records.find((r) => r.className === className);

          const missingDates = [];

          for (const date of expectedDates) {
            const dateKey = date.toLocaleDateString("en-CA", {
              timeZone: "Africa/Lagos",
            });

            const found = record?.attendanceRecord?.some((a) => {
              if (!a.termdate) return false;

              const recordKey = new Date(a.termdate).toLocaleDateString(
                "en-CA",
                { timeZone: "Africa/Lagos" }
              );

              return recordKey === dateKey;
            });

            if (!found) {
              missingDates.push(date.toDateString());
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
            <div style="font-family: Arial; padding: 10px;">
              <h2>📊 These classes have missing attendances so far</h2>
              <p><b>Programme:</b> ${config.programme}</p>
              <hr />

              ${missing.map(item => `
                <div style="margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                  <h3 style="margin: 0; color: #c0392b;">
                    ${item.class}
                  </h3>
                  <p><b>Missing Dates:</b></p>
                  <ul style="margin-top: 5px;">
                    ${item.dates.map(d => `
                      <li>${d}</li>
                    `).join("")}
                  </ul>
                </div>
              `).join("")}
            </div>
          `;

          for (const admin of admins) {
            await SEND_NOTIFICATION_EMAIL(
              admin.email,
              `Weekly Attendance Report (${config.programme})`,
              html,
              {
                type: "weekly",
                programme: config.programme,
                weekKey: todayKey
              }
            );
          }

          await CronLog.create({
            type: "weekly",
            programme: config.programme,
            status: "success",
          });
        }

        config.lastWeeklySummarySent = todayKey;
        await config.save();
      }
    }

    // console.log("✅ Job finished");
  } catch (err) {
    console.error("❌ Cron Error:", err);
  } finally {
    running = false;
  }
};

/* ================= CRON ================= */

cron.schedule("*/10 * * * *", async () => {
  console.log("🔥 CRON FIRED:", new Date().toISOString());
  await runAttendanceJob();
});

console.log("✅ Attendance cron initialized");

module.exports = { runAttendanceJob };