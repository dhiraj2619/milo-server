const CoinStore = require("../models/CoinStore.model");
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
const Subscription = require("../models/Subscription.model");

const respondError = (res, error, message) =>
  res
    .status(error?.code === 11000 ? 409 : 400)
    .json({
      success: false,
      message:
        error?.code === 11000
          ? "A record with the same unique value already exists."
          : error.message || message,
    });
const adminQuery = (req) =>
  req.auth?.user?.role === "admin" && req.query.includeInactive === "true"
    ? {}
    : { isActive: true };

const priceOffFor = (originalPrice, discountPrice) => {
  const original = Number(originalPrice);
  const discounted = Number(discountPrice);
  if (!Number.isFinite(original) || !Number.isFinite(discounted) || original < 0 || discounted < 0 || discounted > original) {
    throw new Error("Original price must be greater than or equal to discount price.");
  }
  return original > 0 ? Number((((original - discounted) / original) * 100).toFixed(2)) : 0;
};

const coinStorePayload = (body = {}) => {
  const { coins, discountPrice, originalPrice, isPopular, isActive, sortOrder } = body;
  return {
    coins,
    discountPrice,
    originalPrice,
    priceOff: priceOffFor(originalPrice, discountPrice),
    ...(isPopular !== undefined && { isPopular }),
    ...(isActive !== undefined && { isActive }),
    ...(sortOrder !== undefined && { sortOrder }),
  };
};

const getCoinStore = async (req, res) => {
  try {
    const coinStores = await CoinStore.find(adminQuery(req)).sort({ sortOrder: 1, coins: 1 }).lean();
    res.json({ success: true, data: { coinStores } });
  } catch (error) {
    respondError(res, error, "Unable to load coin store products.");
  }
};

const createCoinStore = async (req, res) => {
  try {
    const coinStore = await CoinStore.create(coinStorePayload(req.body));
    res.status(201).json({ success: true, data: { coinStore } });
  } catch (error) {
    respondError(res, error, "Unable to create coin store product.");
  }
};

const updateCoinStore = async (req, res) => {
  try {
    const existing = await CoinStore.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Coin store product not found." });
    const coinStore = await CoinStore.findByIdAndUpdate(
      req.params.id,
      coinStorePayload({ ...existing.toObject(), ...req.body }),
      { new: true, runValidators: true },
    );
    res.json({ success: true, data: { coinStore } });
  } catch (error) {
    respondError(res, error, "Unable to update coin store product.");
  }
};

const deleteCoinStore = async (req, res) => {
  try {
    const coinStore = await CoinStore.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!coinStore) return res.status(404).json({ success: false, message: "Coin store product not found." });
    res.json({ success: true, data: { coinStore } });
  } catch (error) {
    respondError(res, error, "Unable to disable coin store product.");
  }
};
const getSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find(adminQuery(req))
      .sort({ sortOrder: 1, durationDays: 1 })
      .lean();
    res.json({ success: true, data: { plans } });
  } catch (error) {
    respondError(res, error, "Unable to load subscription plans.");
  }
};
const createSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: { plan } });
  } catch (error) {
    respondError(res, error, "Unable to create subscription plan.");
  }
};
const updateSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Subscription plan not found." });
    res.json({ success: true, data: { plan } });
  } catch (error) {
    respondError(res, error, "Unable to update subscription plan.");
  }
};
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!plan)
      return res
        .status(404)
        .json({ success: false, message: "Subscription plan not found." });
    res.json({ success: true, data: { plan } });
  } catch (error) {
    respondError(res, error, "Unable to disable subscription plan.");
  }
};
const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.auth.user._id,
      status: { $in: ["active", "trial"] },
      endsAt: { $gt: new Date() },
    })
      .populate("plan")
      .sort({ endsAt: -1 })
      .lean();
    res.json({ success: true, data: { subscription } });
  } catch (error) {
    respondError(res, error, "Unable to load subscription.");
  }
};

module.exports = {
  getCoinStore,
  createCoinStore,
  updateCoinStore,
  deleteCoinStore,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getMySubscription,
};
