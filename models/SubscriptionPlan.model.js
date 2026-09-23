const mongoose = require("mongoose");

const featureSchema = new mongoose.Schema({
  dailyBonusCoins: { type: Boolean, default: false },
  monthlyBonusCoins: { type: Boolean, default: false },
  premiumBadge: { type: Boolean, default: false },
  extraCallRequests: { type: Boolean, default: false },
  priorityConnect: { type: Boolean, default: false },
  nearbyUsers: { type: Boolean, default: false },
  languageFiltersBasic: { type: Boolean, default: false },
  languageFiltersAdvanced: { type: Boolean, default: false },
  profileVisibilityBoost: { type: Boolean, default: false },
  profilePriority: { type: Boolean, default: false },
  dailyProfileBoost: { type: Boolean, default: false },
  fasterConnectMatching: { type: Boolean, default: false },
  higherCallChatPriority: { type: Boolean, default: false },
  exclusiveAvatarStyles: { type: Boolean, default: false },
}, { _id: false });

const subscriptionPlanSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 50 },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  planType: { type: String, enum: ["subscription", "trial"], default: "subscription" },
  shortDescription: { type: String, required: true, trim: true, maxlength: 150 },
  detailedDescription: { type: String, trim: true, maxlength: 500, default: "" },
  durationDays: { type: Number, required: true, min: 1 },
  price: {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR", uppercase: true, trim: true },
  },
  bonusCoins: {
    daily: { type: Number, default: 0, min: 0 },
    monthly: { type: Number, default: 0, min: 0 },
  },
  features: { type: featureSchema, default: () => ({}) },
  isPopular: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });
module.exports = mongoose.model("SubscriptionPlan", subscriptionPlanSchema);