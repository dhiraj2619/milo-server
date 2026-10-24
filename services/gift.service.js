const Gift = require("../models/Gift.model");
const User = require("../models/User.model");
const {debitCoins} = require("./coin.service");

// Charges the sender and records the gift for the receiver.
// `requestId` comes from the app, so a retried send is charged only once.
// Throws {status: 409} when the sender doesn't have enough coins. Returns the sender's new balance.
async function sendGift({sender, receiver, gift, requestId, callId}) {
  const charged = await debitCoins({
    userId: sender._id,
    type: "gift_sent",
    amount: gift.coins,
    idempotencyKey: `gift:${sender._id}:${requestId}`,
    metadata: {giftId: gift.id, to: String(receiver._id), callId},
  });
  if (charged) {
    await Promise.all([
      Gift.create({from: sender._id, to: receiver._id, giftId: gift.id, coins: gift.coins, callId}),
      User.updateOne({_id: receiver._id}, {$inc: {giftsReceived: 1, [`giftCounts.${gift.id}`]: 1}}),
    ]);
  }
  const updated = await User.findById(sender._id).select("coinBalance").lean();
  return {coinBalance: updated?.coinBalance ?? 0, duplicate: !charged};
}

module.exports = {sendGift};
