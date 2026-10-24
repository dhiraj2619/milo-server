const mongoose = require("mongoose");

// Per-user, per-day usage of MILO Special (day is YYYY-MM-DD in Asia/Kolkata).
const dailyActivitySchema = new mongoose.Schema(
  {
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    day: {type: String, required: true},
    // Today's Match picks shown so far, oldest first; the last one is the current match.
    matches: [{type: mongoose.Schema.Types.ObjectId, ref: "User"}],
    speedRounds: {type: Number, default: 0, min: 0},
  },
  {timestamps: true},
);

dailyActivitySchema.index({user: 1, day: 1}, {unique: true});

module.exports = mongoose.model("DailyActivity", dailyActivitySchema);
