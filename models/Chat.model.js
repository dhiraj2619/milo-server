const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  text: {type: String, required: true, trim: true, maxlength: 2000},
  type: {type: String, enum: ['text', 'call', 'video'], default: 'text'},
  readBy: [{type: mongoose.Schema.Types.ObjectId, ref: 'User'}],
}, {timestamps: true});

const chatSchema = new mongoose.Schema({
  participants: [{type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true}],
  messages: [messageSchema],
  lastMessage: {type: messageSchema, default: null},
}, {timestamps: true});

chatSchema.index({participants: 1, updatedAt: -1});

module.exports = mongoose.model('Chat', chatSchema);
