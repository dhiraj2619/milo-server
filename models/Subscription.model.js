const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  plan: {type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true},
  paymentOrder: {type: mongoose.Schema.Types.ObjectId, ref: 'PaymentOrder', required: true},
  status: {type: String, enum: ['active', 'expired', 'cancelled', 'trial'], default: 'active', index: true},
  startsAt: {type: Date, required: true},
  endsAt: {type: Date, required: true, index: true},
  cancelledAt: {type: Date, default: null},
}, {timestamps: true});

subscriptionSchema.index({user: 1, status: 1, endsAt: -1});
module.exports = mongoose.model('Subscription', subscriptionSchema);
