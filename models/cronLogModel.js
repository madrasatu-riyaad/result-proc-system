const mongoose = require("mongoose");

const cronLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["daily", "weekly"],
    required: true,
  },

  programme: {
    type: String,
    required: true,
  },

  status: {
    type: String,
    enum: ["success", "failed"],
    required: true,
  },

  message: {
    type: String,
    default: "",
  },

  attempts: {
    type: Number,
    default: 1,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* ================= INDEXING (IMPORTANT BUT LIGHTWEIGHT) ================= */
cronLogSchema.index({ createdAt: -1 });
cronLogSchema.index({ type: 1, programme: 1 });

module.exports = mongoose.model("CronLog", cronLogSchema);