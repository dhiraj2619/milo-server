const CoinPackage = require("../models/CoinPackage.model");
const SubscriptionPlan = require("../models/SubscriptionPlan.model");
const Subscription = require("../models/Subscription.model");

const respondError = (res, error, message) =>
  res
    .status(error?.code === 11000 ? 409 : 400)
    .json({
      success: false,
      message:
        error?.code === 11000
          ? "A record with that code already exists."
          : error.message || message,
    });
const adminQuery = (req) =>
  req.auth?.user?.role === "admin" && req.query.includeInactive === "true"
    ? {}
    : { isActive: true };

const getCoinPackages = async (req, res) => {
  try {
    const packages = await CoinPackage.find(adminQuery(req))
      .sort({ sortOrder: 1, coins: 1 })
      .lean();
    res.json({ success: true, data: { packages } });
  } catch (error) {
    respondError(res, error, "Unable to load coin packages.");
  }
};
const createCoinPackage = async (req, res) => {
  try {
    const coinPackage = await CoinPackage.create(req.body);
    res.status(201).json({ success: true, data: { coinPackage } });
  } catch (error) {
    respondError(res, error, "Unable to create coin package.");
  }
};
const updateCoinPackage = async (req, res) => {
  try {
    const coinPackage = await CoinPackage.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );
    if (!coinPackage)
      return res
        .status(404)
        .json({ success: false, message: "Coin package not found." });
    res.json({ success: true, data: { coinPackage } });
  } catch (error) {
    respondError(res, error, "Unable to update coin package.");
  }
};
const deleteCoinPackage = async (req, res) => {
  try {
    const coinPackage = await CoinPackage.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!coinPackage)
      return res
        .status(404)
        .json({ success: false, message: "Coin package not found." });
    res.json({ success: true, data: { coinPackage } });
  } catch (error) {
    respondError(res, error, "Unable to disable coin package.");
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
  getCoinPackages,
  createCoinPackage,
  updateCoinPackage,
  deleteCoinPackage,
  getSubscriptionPlans,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getMySubscription,
};
