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

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/* indexes */
cronLogSchema.index({ type: 1, programme: 1 });

cronLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30 }
);

module.exports = mongoose.model("CronLog", cronLogSchema);