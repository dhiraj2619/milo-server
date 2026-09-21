const CoinTransaction = require("../models/CoinTransaction.model");
const User = require("../models/User.model");

async function creditCoins({userId, type, amount, idempotencyKey, referenceUser = null, paymentId = null, paymentOrder = null, metadata = {}}) {
  const existing = await CoinTransaction.exists({idempotencyKey});
  if (existing) return false;
  const user = await User.findOneAndUpdate({_id: userId}, {$inc: {coinBalance: amount}}, {new: true});
  if (!user) throw new Error('User not found.');
  try {
    await CoinTransaction.create({user: userId, direction: 'credit', type, amount, balanceAfter: user.coinBalance, idempotencyKey, referenceUser, paymentId, paymentOrder, metadata});
    return true;
  } catch (error) {
    if (error.code === 11000) {
      await User.updateOne({_id: userId}, {$inc: {coinBalance: -amount}});
      return false;
    }
    throw error;
  }
}

async function debitCoins({userId, type, amount, idempotencyKey, usageEvent = null, metadata = {}}) {
  const existing = await CoinTransaction.exists({idempotencyKey});
  if (existing) return false;
  const user = await User.findOneAndUpdate({_id: userId, coinBalance: {$gte: amount}}, {$inc: {coinBalance: -amount}}, {new: true});
  if (!user) throw Object.assign(new Error('Insufficient coin balance.'), {status: 409});
  try {
    await CoinTransaction.create({user: userId, direction: 'debit', type, amount, balanceAfter: user.coinBalance, idempotencyKey, usageEvent, metadata});
    return true;
  } catch (error) {
    if (error.code === 11000) {
      await User.updateOne({_id: userId}, {$inc: {coinBalance: amount}});
      return false;
    }
    throw error;
  }
}

module.exports = {creditCoins, debitCoins};
