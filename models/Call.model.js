const mongoose = require("mongoose");

// One document per call attempt, written when the call finishes.
const callSchema = new mongoose.Schema(
  {
    callId: {type: String, required: true, unique: true, index: true},
    caller: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    callee: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    callType: {type: String, enum: ["audio", "video"], required: true},
    status: {
      type: String,
      enum: ["completed", "missed", "rejected", "cancelled", "failed"],
      required: true,
    },
    endReason: {type: String, default: null},
    startedAt: {type: Date, required: true},
    answeredAt: {type: Date, default: null},
    endedAt: {type: Date, required: true},
    durationSeconds: {type: Number, default: 0, min: 0},
    // Where the call started: null for a direct call, or a MILO Special room key such as "speed".
    source: {type: String, default: null},
  },
  {timestamps: true},
);

module.exports = mongoose.model("Call", callSchema);
