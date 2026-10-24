const mongoose = require("mongoose");

// Someone opened another user's profile. One row per viewer, viewed user and day (YYYY-MM-DD, IST).
const profileViewSchema = new mongoose.Schema(
  {
    viewer: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    viewed: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    day: {type: String, required: true},
  },
  {timestamps: true},
);

profileViewSchema.index({viewer: 1, viewed: 1, day: 1}, {unique: true});
profileViewSchema.index({viewed: 1, updatedAt: -1});

module.exports = mongoose.model("ProfileView", profileViewSchema);
