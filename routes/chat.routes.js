const router = require('express').Router();
const {getConversations, getMessages, sendMessage} = require('../controllers/chat.controller');
router.get('/conversations', getConversations);
router.get('/:chatId/messages', getMessages);
router.post('/:participantId/messages', sendMessage);
module.exports = router;
