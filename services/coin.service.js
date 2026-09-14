const CoinTransaction = require("../models/CoinTransaction.model");
const User = require("../models/User.model");

async function creditCoins({userId, type, amount, idempotencyKey, referenceUser = null, paymentId = null}) {
  try {
    await CoinTransaction.create({user: userId, type, amount, idempotencyKey, referenceUser, paymentId});
    await User.updateOne({_id: userId}, {$inc: {coinBalance: amount}});
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

module.exports = {creditCoins};
