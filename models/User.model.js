const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },

    gender: {
      type: String,
      enum: ["male", "female"],
      required: true,
    },

    languages: [
      {
        type: String,
        trim: true,
      },
    ],

    isOnline: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    role: {
      type: String,
      enum: ["user", "host", "admin"],
      default: "user",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
