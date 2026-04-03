const cron = require("node-cron");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 🔒 prevent crash if env missing
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.log("⚠️ Supabase heartbeat disabled (missing env vars)");
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null;

const runSupabaseHeartbeat = async () => {
  if (!supabase) return;

  try {
    await supabase.from("system_meta").upsert({
      id: 1,
      last_seen: new Date().toISOString(),
      source: "attendance_system",
    });

    console.log("Supabase heartbeat sent");
  } catch (err) {
    console.error("❌ Heartbeat error:", err.message);
  }
};

/* ========================
   STARTUP PING (IMPORTANT)
======================== */
runSupabaseHeartbeat();

/* ========================
   SCHEDULED HEARTBEAT
   every 12 hours
======================== */
cron.schedule("0 */12 * * *", runSupabaseHeartbeat);

console.log("Supabase heartbeat initialized");

module.exports = { runSupabaseHeartbeat };