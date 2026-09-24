const mongoose = require("mongoose");

const coinStoreSchema = new mongoose.Schema(
  {
    coins: { type: Number, required: true, min: 1 },
    discountPrice: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    priceOff: { type: Number, default: 0, min: 0, max: 100 },
    isPopular: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

coinStoreSchema.pre("validate", function calculatePriceOff() {
  if (this.discountPrice > this.originalPrice) {
    this.invalidate("discountPrice", "Discount price cannot be greater than original price.");
  }
  this.priceOff = this.originalPrice > 0
    ? Number((((this.originalPrice - this.discountPrice) / this.originalPrice) * 100).toFixed(2))
    : 0;

});

module.exports = mongoose.model("CoinStore", coinStoreSchema);