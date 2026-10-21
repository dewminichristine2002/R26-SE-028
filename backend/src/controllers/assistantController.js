const {
  handleChat,
  listConversations,
  listMessages,
  renameConversation,
  deleteConversation,
} = require('../services/assistantOrchestrator');
const { buildSummary } = require('../services/assistantSummaryService');

const chat = async (req, res) => {
  try {
    const result = await handleChat({
      userId: req.user.id,
      role: req.user.role || 'user',
      message: req.body?.message,
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[Assistant] chat error:', error.message);
    return res.status(status).json({ error: error.message || 'Assistant chat failed' });
  }
};

const summary = async (req, res) => {
  try {
    const data = await buildSummary(req.user.id, req.user.role || 'user');
    return res.json(data);
  } catch (error) {
    console.error('[Assistant] summary error:', error.message);
    return res.status(500).json({ error: 'Failed to build dashboard summary' });
  }
};

const conversations = async (req, res) => {
  try {
    const rows = await listConversations(req.user.id);
    return res.json({ conversations: rows });
  } catch (error) {
    console.error('[Assistant] conversations error:', error.message);
    return res.status(500).json({ error: 'Failed to load conversations' });
  }
};

const conversationMessages = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: 'Valid conversation id is required' });
    }
    const rows = await listMessages(req.user.id, conversationId);
    return res.json({ conversationId, messages: rows });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[Assistant] messages error:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to load conversation' });
  }
};

const renameConversationHandler = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: 'Valid conversation id is required' });
    }
    const updated = await renameConversation(req.user.id, conversationId, req.body?.title);
    return res.json({ conversation: updated });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[Assistant] rename error:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to rename conversation' });
  }
};

const deleteConversationHandler = async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({ error: 'Valid conversation id is required' });
    }
    const result = await deleteConversation(req.user.id, conversationId);
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[Assistant] delete error:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to delete conversation' });
  }
};

module.exports = {
  chat,
  summary,
  conversations,
  conversationMessages,
  renameConversationHandler,
  deleteConversationHandler,
};
