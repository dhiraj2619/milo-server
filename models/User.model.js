const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
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
      enum: ["male", "female", "other"],
      required: true,
    },

    languages: [
      {
        type: String,
        trim: true,
      },
    ],
    avatarSeed: {type: String, default: 'milo-user', trim: true, maxlength: 100},
    avatarStyle: {type: mongoose.Schema.Types.Mixed, default: null},

    profileCompleted: {type: Boolean, default: false},
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


