const mongoose = require('mongoose');

const paymentOrderSchema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  kind: {type: String, enum: ['coin_package', 'subscription'], required: true},
  coinPackage: {type: mongoose.Schema.Types.ObjectId, ref: 'CoinPackage', default: null},
  subscriptionPlan: {type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null},
  amount: {type: Number, required: true, min: 1},
  currency: {type: String, default: 'INR', uppercase: true},
  gateway: {type: String, enum: ['razorpay', 'google_play', 'apple'], required: true},
  gatewayOrderId: {type: String, unique: true, sparse: true, trim: true},
  gatewayPaymentId: {type: String, unique: true, sparse: true, trim: true},
  status: {type: String, enum: ['created', 'pending', 'paid', 'failed', 'refunded'], default: 'created', index: true},
  verifiedAt: {type: Date, default: null},
}, {timestamps: true});

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
