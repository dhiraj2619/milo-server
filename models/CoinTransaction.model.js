const mongoose = require("mongoose");

const coinTransactionSchema = new mongoose.Schema(
  {
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    type: {type: String, required: true, enum: ["welcome_bonus", "daily_claim", "referral_friend_bonus", "referrer_signup_bonus", "coin_purchase", "referrer_first_purchase_bonus"]},
    amount: {type: Number, required: true, min: 1},
    idempotencyKey: {type: String, required: true, unique: true},
    referenceUser: {type: mongoose.Schema.Types.ObjectId, ref: "User", default: null},
    paymentId: {type: String, default: null, trim: true},
  },
  {timestamps: true},
);

module.exports = mongoose.model("CoinTransaction", coinTransactionSchema);
