const mongoose = require("mongoose");

// One gift sent from one user to another. The coins are recorded in CoinTransaction (type gift_sent).
const giftSchema = new mongoose.Schema(
  {
    from: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    to: {type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true},
    giftId: {type: String, required: true},
    coins: {type: Number, required: true, min: 1},
    callId: {type: String, default: null},
  },
  {timestamps: true},
);

module.exports = mongoose.model("Gift", giftSchema);
