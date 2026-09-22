const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  code: {type: String, required: true, unique: true, trim: true, uppercase: true},
  name: {type: String, required: true, trim: true, maxlength: 80},
  durationDays: {type: Number, required: true, min: 1},
  price: {
    amount: {type: Number, required: true, min: 0},
    currency: {type: String, default: 'INR', uppercase: true, trim: true},
  },
  benefits: {
    unlimitedChats: {type: Boolean, default: false},
    callDiscountPercent: {type: Number, default: 0, min: 0, max: 100},
    profileBoosts: {type: Number, default: 0, min: 0},
    advancedFilters: {type: Boolean, default: false},
    adFree: {type: Boolean, default: false},
  },
  isActive: {type: Boolean, default: true, index: true},
  sortOrder: {type: Number, default: 0},
}, {timestamps: true});

subscriptionPlanSchema.index({isActive: 1, sortOrder: 1});
module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
