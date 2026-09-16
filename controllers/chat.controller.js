const Chat = require('../models/Chat.model');
const User = require('../models/User.model');
const {getFirebaseAuth} = require('../config/firebaseAdmin');

const authenticate = async req => {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Please sign in again.'), {status: 401});
  return getFirebaseAuth().verifyIdToken(authorization.slice(7), true);
};

const getConversations = async (req, res) => {
  try {
    const decoded = await authenticate(req);
    const currentUser = await User.findOne({firebaseUid: decoded.uid}).select('_id').lean();
    if (!currentUser) return res.status(404).json({success: false, message: 'Profile not found.'});

    const chats = await Chat.find({participants: currentUser._id})
      .sort({updatedAt: -1})
      .populate({path: 'participants', select: 'firebaseUid nickname languages avatarSeed avatarStyle photoUrl isOnline lastSeen'})
      .lean();

    const conversations = chats.map(chat => {
      const participant = chat.participants.find(user => String(user._id) !== String(currentUser._id));
      if (!participant) return null;
      const lastMessage = chat.lastMessage || chat.messages?.[chat.messages.length - 1] || null;
      return {
        id: String(chat._id),
        participant,
        lastMessage: lastMessage ? {text: lastMessage.text, type: lastMessage.type, createdAt: lastMessage.createdAt} : null,
        updatedAt: chat.updatedAt,
      };
    }).filter(Boolean);

    return res.json({success: true, data: {conversations}});
  } catch (error) {
    return res.status(error.status || 503).json({success: false, message: error.message || 'Unable to load conversations.'});
  }
};

module.exports = {getConversations};
