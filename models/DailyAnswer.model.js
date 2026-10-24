const mongoose = require("mongoose");

// A user's answer to the Question of the Day (one per user per day).
const dailyAnswerSchema = new mongoose.Schema(
  {
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    day: {type: String, required: true},
    question: {type: String, required: true},
    answer: {type: String, required: true, trim: true, maxlength: 120},
  },
  {timestamps: true},
);

dailyAnswerSchema.index({user: 1, day: 1}, {unique: true});
dailyAnswerSchema.index({day: 1, updatedAt: -1});

module.exports = mongoose.model("DailyAnswer", dailyAnswerSchema);
