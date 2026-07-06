const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const {
  chat,
  summary,
  conversations,
  conversationMessages,
  renameConversationHandler,
  deleteConversationHandler,
} = require('../controllers/assistantController');

const router = express.Router();

const recentChatHits = new Map();
const CHAT_RATE_LIMIT = Number(process.env.ASSISTANT_RATE_LIMIT_PER_MIN || 30);

const rateLimitChat = (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next();
  }

  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (recentChatHits.get(userId) || []).filter((ts) => ts >= windowStart);

  if (hits.length >= CHAT_RATE_LIMIT) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before asking another question.',
    });
  }

  hits.push(now);
  recentChatHits.set(userId, hits);
  return next();
};

router.use(requireDatabase);
router.use(requireAuth);

router.get('/summary', summary);
router.post('/chat', rateLimitChat, chat);
router.get('/conversations', conversations);
router.patch('/conversations/:id', renameConversationHandler);
router.delete('/conversations/:id', deleteConversationHandler);
router.get('/conversations/:id/messages', conversationMessages);

module.exports = router;
