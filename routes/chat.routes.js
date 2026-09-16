const router = require('express').Router();
const {getConversations} = require('../controllers/chat.controller');

router.get('/conversations', getConversations);

module.exports = router;
