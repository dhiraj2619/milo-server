const { default: mongoose } = require("mongoose");

const coinPackageSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // starter_70
    coins: { type: Number, required: true, min: 1 },
    bonusCoins: { type: Number, default: 0, min: 0 },

    price: {
      amount: { type: Number, required: true, min: 1 },
      currency: { type: String, default: "INR" },
    },

    originalPrice: { type: Number, default: null },
    discountPercent: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CoinPackage", coinPackageSchema);
