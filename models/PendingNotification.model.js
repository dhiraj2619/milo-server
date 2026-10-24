const mongoose = require("mongoose");

// A push notification waiting to be sent later, e.g. "Riya liked your profile" 8–9 hours after the like.
// Several likes before it goes out are collected into one notification (actors).
const pendingNotificationSchema = new mongoose.Schema(
  {
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true},
    type: {type: String, enum: ["like"], required: true},
    actors: [{type: mongoose.Schema.Types.ObjectId, ref: "User"}],
    sendAfter: {type: Date, required: true},
    status: {type: String, enum: ["pending", "sent", "skipped"], default: "pending"},
    // Why it was skipped or when it went out, for debugging.
    note: {type: String, default: null},
    sentAt: {type: Date, default: null},
  },
  {timestamps: true},
);

pendingNotificationSchema.index({status: 1, sendAfter: 1});
// At most one waiting notification of each type per user; new likes join it.
pendingNotificationSchema.index({user: 1, type: 1}, {unique: true, partialFilterExpression: {status: "pending"}});

module.exports = mongoose.model("PendingNotification", pendingNotificationSchema);
