const { default: mongoose } = require("mongoose");

const coinTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },

    type: {
      type: String,
      enum: [
        'welcome_bonus',
        'daily_claim',
        'referral_bonus',
        'coin_purchase',
        'audio_call_charge',
        'video_call_charge',
        'chat_charge',
        'subscription_purchase',
        'admin_adjustment',
        'refund',
      ],
      required: true,
    },

    amount: {type: Number, required: true, min: 1},

    balanceAfter: {type: Number, required: true, min: 0},

    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },

    paymentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentOrder',
      default: null,
    },

    usageEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UsageEvent',
      default: null,
    },

    metadata: {type: mongoose.Schema.Types.Mixed, default: {}},
  },
  {timestamps: true},
);

module.exports = mongoose.model("CoinTransaction",coinTransactionSchema)