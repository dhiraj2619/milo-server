const Chat = require('../models/Chat.model');
const User = require('../models/User.model');
const {getFirebaseAuth} = require('../config/firebaseAdmin');

const authenticate = async req => {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Please sign in again.'), {status: 401});
  return getFirebaseAuth().verifyIdToken(authorization.slice(7), true);
};

const currentUserFor = async decoded => {
  const user = await User.findOne({firebaseUid: decoded.uid});
  if (!user) throw Object.assign(new Error('Profile not found.'), {status: 404});
  return user;
};

const getConversations = async (req, res) => {
  try {
    const currentUser = await currentUserFor(await authenticate(req));
    const chats = await Chat.find({participants: currentUser._id}).sort({updatedAt: -1}).populate({path: 'participants', select: 'firebaseUid nickname languages avatarSeed avatarStyle photoUrl isOnline lastSeen'}).lean();
    const conversations = chats.map(chat => {
      const participant = chat.participants.find(user => String(user._id) !== String(currentUser._id));
      const lastMessage = chat.lastMessage || chat.messages?.[chat.messages.length - 1] || null;
      if (!participant) return null;
      const unreadCount = chat.messages.filter(message => String(message.sender) !== String(currentUser._id) && !message.readBy?.some(userId => String(userId) === String(currentUser._id))).length;
      return {id: String(chat._id), participant, lastMessage: lastMessage ? {text: lastMessage.text, type: lastMessage.type, createdAt: lastMessage.createdAt} : null, unreadCount, updatedAt: chat.updatedAt};
    }).filter(Boolean);
    return res.json({success: true, data: {conversations}});
  } catch (error) {
    return res.status(error.status || 503).json({success: false, message: error.message || 'Unable to load conversations.'});
  }
};

const getMessages = async (req, res) => {
  try {
    const currentUser = await currentUserFor(await authenticate(req));
    const chat = await Chat.findOne({_id: req.params.chatId, participants: currentUser._id}).populate({path: 'messages.sender', select: 'firebaseUid'});
    if (!chat) return res.status(404).json({success: false, message: 'Conversation not found.'});
    chat.messages.forEach(message => { if (String(message.sender._id) !== String(currentUser._id) && !message.readBy.some(userId => String(userId) === String(currentUser._id))) message.readBy.push(currentUser._id); });
    await chat.save();
    return res.json({success: true, data: {messages: chat.messages.map(message => ({id: String(message._id), text: message.text, type: message.type, senderFirebaseUid: message.sender.firebaseUid, createdAt: message.createdAt}))}});
  } catch (error) {
    return res.status(error.status || 503).json({success: false, message: error.message || 'Unable to load messages.'});
  }
};

const sendMessage = async (req, res) => {
  try {
    const sender = await currentUserFor(await authenticate(req));
    const recipient = await User.findById(req.params.participantId);
    const {text, type = 'text'} = req.body || {};
    if (!recipient) return res.status(404).json({success: false, message: 'User not found.'});
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) return res.status(400).json({success: false, message: 'Enter a valid message.'});
    const message = {sender: sender._id, text: text.trim(), type, readBy: [sender._id]};
    const chat = await Chat.findOneAndUpdate({participants: {$all: [sender._id, recipient._id]}, $expr: {$eq: [{$size: '$participants'}, 2]}}, {$set: {lastMessage: message}, $push: {messages: message}}, {new: true});
    if (chat) {
      const io = req.app.get('io');
      io?.to(sender.firebaseUid).to(recipient.firebaseUid).emit('chat:updated', {chatId: String(chat._id)});
      return res.status(201).json({success: true, data: {chatId: String(chat._id)}});
    }
    const created = await Chat.create({participants: [sender._id, recipient._id], messages: [message], lastMessage: message});
    return res.status(201).json({success: true, data: {chatId: String(created._id)}});
  } catch (error) {
    return res.status(error.status || 503).json({success: false, message: error.message || 'Unable to send message.'});
  }
};

module.exports = {getConversations, getMessages, sendMessage};
