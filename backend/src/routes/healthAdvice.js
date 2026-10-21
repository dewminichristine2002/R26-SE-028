const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const { buildHealthAdviceResponse } = require('../services/healthAdviceService');

const router = express.Router();

router.use(requireDatabase);
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const result = await buildHealthAdviceResponse({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      question: req.body?.question,
      riskType: req.body?.riskType || req.body?.risk_type,
      latestPrediction: req.body?.latestPrediction || req.body?.latest_prediction || {},
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json({
      answer: result.answer,
      riskType: result.riskType,
      prediction: result.prediction,
      sources: result.sources,
      safetyNote: result.safetyNote,
      conversationId: result.conversationId,
      fallback: result.fallback,
      followUps: result.followUps,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[HealthAdvice] error:', error.message);
    return res.status(status).json({ error: error.message || 'Failed to generate health advice' });
  }
});

module.exports = router;
