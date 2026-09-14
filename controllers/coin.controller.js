const User = require("../models/User.model");
const CoinTransaction = require("../models/CoinTransaction.model");
const {getFirebaseAuth} = require("../config/firebaseAdmin");
const {creditCoins} = require("../services/coin.service");

const DAILY_COIN_REWARD = 70;
const DAILY_CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;

const authenticate = async req => {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("Please sign in again."), {status: 401});
  return getFirebaseAuth().verifyIdToken(authorization.slice(7), true);
};

const getWallet = async (req, res) => {
  try {
    const decoded = await authenticate(req);
    const user = await User.findOne({firebaseUid: decoded.uid}).select("coinBalance referralCode lastDailyCoinClaimAt").lean();
    if (!user) return res.status(404).json({success: false, message: "Profile not found."});
    const transactions = await CoinTransaction.find({user: user._id}).sort({createdAt: -1}).limit(20).lean();
    return res.json({success: true, data: {coinBalance: user.coinBalance, referralCode: user.referralCode, lastDailyCoinClaimAt: user.lastDailyCoinClaimAt, transactions}});
  } catch (error) {
    return res.status(error.status || 401).json({success: false, message: error.message || "Unable to load wallet."});
  }
};

const claimDailyCoins = async (req, res) => {
  try {
    const decoded = await authenticate(req);
    const claimedAt = new Date();
    const eligibleBefore = new Date(claimedAt.getTime() - DAILY_CLAIM_INTERVAL_MS);
    const user = await User.findOneAndUpdate(
      {firebaseUid: decoded.uid, $or: [{lastDailyCoinClaimAt: null}, {lastDailyCoinClaimAt: {$exists: false}}, {lastDailyCoinClaimAt: {$lte: eligibleBefore}}]},
      {$inc: {coinBalance: DAILY_COIN_REWARD}, $set: {lastDailyCoinClaimAt: claimedAt}},
      {new: true},
    );
    if (!user) {
      const existingUser = await User.findOne({firebaseUid: decoded.uid}).select("lastDailyCoinClaimAt").lean();
      if (!existingUser) return res.status(404).json({success: false, message: "Profile not found."});
      const nextClaimAt = new Date(new Date(existingUser.lastDailyCoinClaimAt).getTime() + DAILY_CLAIM_INTERVAL_MS);
      return res.status(409).json({success: false, message: "Your daily coins are not ready yet.", data: {nextClaimAt}});
    }
    CoinTransaction.create({user: user._id, type: "daily_claim", amount: DAILY_COIN_REWARD, idempotencyKey: `daily:${user._id}:${claimedAt.getTime()}`}).catch(error => console.error("Daily coin transaction audit error:", error));
    return res.json({success: true, message: `${DAILY_COIN_REWARD} daily coins claimed.`, data: {coinBalance: user.coinBalance, claimedAt, nextClaimAt: new Date(claimedAt.getTime() + DAILY_CLAIM_INTERVAL_MS)}});
  } catch (error) {
    return res.status(error.status || 503).json({success: false, message: error.message || "Unable to claim daily coins."});
  }
};

// Call only from a verified payment webhook or trusted server job, never from the mobile app.
const recordVerifiedPurchase = async (req, res) => {
  if (!process.env.INTERNAL_API_KEY || req.headers["x-internal-api-key"] !== process.env.INTERNAL_API_KEY) return res.status(403).json({success: false, message: "Forbidden."});
  try {
    const {buyerFirebaseUid, paymentId, coins} = req.body || {};
    if (typeof buyerFirebaseUid !== "string" || typeof paymentId !== "string" || !Number.isInteger(coins) || coins < 1) return res.status(400).json({success: false, message: "Invalid verified purchase."});
    const buyer = await User.findOne({firebaseUid: buyerFirebaseUid});
    if (!buyer) return res.status(404).json({success: false, message: "Buyer not found."});
    const hadPurchase = await CoinTransaction.exists({user: buyer._id, type: "coin_purchase"});
    const purchaseRecorded = await creditCoins({userId: buyer._id, type: "coin_purchase", amount: coins, idempotencyKey: `purchase:${paymentId}`, paymentId});
    if (purchaseRecorded && !hadPurchase && buyer.referredBy) await creditCoins({userId: buyer.referredBy, type: "referrer_first_purchase_bonus", amount: 50, idempotencyKey: `referrer-first-purchase:${buyer._id}`, referenceUser: buyer._id, paymentId});
    return res.json({success: true, data: {duplicate: !purchaseRecorded}});
  } catch (error) {
    console.error("Verified purchase reward error:", error);
    return res.status(503).json({success: false, message: "Unable to record verified purchase."});
  }
};

module.exports = {getWallet, claimDailyCoins, recordVerifiedPurchase};
