const mongoose = require('mongoose');

const usageEventSchema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  participant: {type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null},
  type: {type: String, enum: ['audio_call', 'video_call', 'chat'], required: true},
  units: {type: Number, required: true, min: 1},
  coinCost: {type: Number, required: true, min: 0},
  startedAt: {type: Date, default: null},
  endedAt: {type: Date, default: null},
  metadata: {type: mongoose.Schema.Types.Mixed, default: {}},
}, {timestamps: true});

module.exports = mongoose.model('UsageEvent', usageEventSchema);
