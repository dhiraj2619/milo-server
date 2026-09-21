const mongoose = require('mongoose');

const coinPackageSchema = new mongoose.Schema({
  code: {type: String, required: true, unique: true, trim: true, uppercase: true},
  coins: {type: Number, required: true, min: 1},
  bonusCoins: {type: Number, default: 0, min: 0},
  price: {amount: {type: Number, required: true, min: 1}, currency: {type: String, default: 'INR', uppercase: true}},
  originalPrice: {type: Number, default: null, min: 1},
  isActive: {type: Boolean, default: true, index: true},
  sortOrder: {type: Number, default: 0},
}, {timestamps: true});

module.exports = mongoose.model('CoinPackage', coinPackageSchema);
