const express = require('express');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  PHASE_ONE_ADVICE_MESSAGE,
  isAdviceRequest,
  getExistingHealthInputs,
  saveOrUpdateHealthValues,
  extractHealthValuesFromMessage,
  saveHealthChatHistory,
  buildDiabetesResponseWithSummary,
} = require('../services/diabetesPredictionService');
const {
  PHASE_ONE_STROKE_ADVICE_MESSAGE,
  isStrokeAdviceRequest,
  getExistingStrokeInputs,
  extractStrokeValuesFromMessage,
  saveStrokeChatHistory,
  buildStrokeResponseWithSummary,
} = require('../services/strokePredictionService');
const {
  PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE,
  isHypertensionAdviceRequest,
  getExistingHypertensionInputs,
  extractHypertensionValuesFromMessage,
  saveHypertensionChatHistory,
  buildHypertensionResponseWithSummary,
} = require('../services/hypertensionPredictionService');
const { buildHealthAdviceResponse } = require('../services/healthAdviceService');

const router = express.Router();

router.use(requireDatabase);
router.use(requireAuth);

router.get('/diabetes/context', async (req, res) => {
  try {
    const context = await getExistingHealthInputs(req.user.id);
    return res.json(context);
  } catch (error) {
    console.error('[Predict] diabetes context error:', error.message);
    return res.status(500).json({ error: 'Failed to load diabetes context' });
  }
});

router.post('/diabetes', async (req, res) => {
  try {
    const values = req.body || {};
    const result = await buildDiabetesResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values,
      userMessage: 'Check my diabetes risk.',
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json(result);
  } catch (error) {
    console.error('[Predict] diabetes prediction error:', error.message);
    const status = String(error.message || '').includes('artifacts are missing') ? 503 : 500;
    return res.status(status).json({ error: error.message || 'Failed to predict diabetes risk' });
  }
});

router.post('/diabetes/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    if (isAdviceRequest(message)) {
      const advice = await buildHealthAdviceResponse({
        userId: req.user.id,
        userRole: req.user.role || 'user',
        question: message,
        riskType: 'Diabetes',
        latestPrediction: req.body?.latestPrediction || {},
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });

      return res.json({
        conversationId: advice.conversationId,
        reply: advice.answer,
        sources: advice.sources,
        safetyNote: advice.safetyNote,
        updatedValues: {},
        shouldPredict: false,
        advice,
      });
    }

    const extractedValues = extractHealthValuesFromMessage(message);
    const shouldPredict =
      /check\s+my\s+diabetes\s+risk|predict|risk/i.test(message) ||
      Object.keys(extractedValues).length > 0;

    if (!shouldPredict) {
      const reply = 'I can update health values and explain your current diabetes risk. Try: "my sugar is 150" or "my BP is 145 over 90".';
      const conversationId = await saveHealthChatHistory(req.user.id, 'user', message, reply, {
        intent: 'diabetes_help_prompt',
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });
      return res.json({
        conversationId,
        reply,
        updatedValues: {},
        shouldPredict: false,
      });
    }

    if (Object.keys(extractedValues).length > 0) {
      await saveOrUpdateHealthValues(req.user.id, extractedValues);
    }

    const result = await buildDiabetesResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values: extractedValues,
      userMessage: message,
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json({
      conversationId: result.conversationId,
      reply: result.summary,
      updatedValues: extractedValues,
      shouldPredict: true,
      prediction: {
        riskType: result.riskType,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        selectedAlgorithm: result.selectedAlgorithm,
        factors: result.factors,
        summary: result.summary,
      },
    });
  } catch (error) {
    console.error('[Predict] diabetes chat error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to process diabetes chat message' });
  }
});

router.get('/stroke/context', async (req, res) => {
  try {
    const context = await getExistingStrokeInputs(req.user.id);
    return res.json(context);
  } catch (error) {
    console.error('[Predict] stroke context error:', error.message);
    return res.status(500).json({ error: 'Failed to load stroke context' });
  }
});

router.post('/stroke', async (req, res) => {
  try {
    const values = req.body || {};
    const result = await buildStrokeResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values,
      userMessage: 'Check my stroke risk.',
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json(result);
  } catch (error) {
    console.error('[Predict] stroke prediction error:', error.message);
    const status = String(error.message || '').includes('artifacts are missing') ? 503 : 500;
    return res.status(status).json({ error: error.message || 'Failed to predict stroke risk' });
  }
});

router.post('/stroke/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    if (isStrokeAdviceRequest(message)) {
      const advice = await buildHealthAdviceResponse({
        userId: req.user.id,
        userRole: req.user.role || 'user',
        question: message,
        riskType: 'Stroke',
        latestPrediction: req.body?.latestPrediction || {},
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });

      return res.json({
        conversationId: advice.conversationId,
        reply: advice.answer,
        sources: advice.sources,
        safetyNote: advice.safetyNote,
        updatedValues: {},
        shouldPredict: false,
        advice,
      });
    }

    const extractedValues = extractStrokeValuesFromMessage(message);
    const shouldPredict =
      /check\s+my\s+stroke\s+risk|stroke.*(?:predict|risk)|predict|risk/i.test(message) ||
      Object.keys(extractedValues).length > 0;

    if (!shouldPredict) {
      const reply = 'I can update health values and explain your current stroke risk. Try: "my BP is 145 over 90", "my sugar is 150", or "my weight is 60kg".';
      const conversationId = await saveStrokeChatHistory(req.user.id, 'user', message, reply, {
        intent: 'stroke_help_prompt',
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });
      return res.json({
        conversationId,
        reply,
        updatedValues: {},
        shouldPredict: false,
      });
    }

    const result = await buildStrokeResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values: extractedValues,
      userMessage: message,
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json({
      conversationId: result.conversationId,
      reply: result.summary,
      updatedValues: extractedValues,
      shouldPredict: true,
      prediction: {
        riskType: result.riskType,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        selectedAlgorithm: result.selectedAlgorithm,
        factors: result.factors,
        summary: result.summary,
      },
    });
  } catch (error) {
    console.error('[Predict] stroke chat error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to process stroke chat message' });
  }
});

router.get('/hypertension/context', async (req, res) => {
  try {
    const context = await getExistingHypertensionInputs(req.user.id);
    return res.json(context);
  } catch (error) {
    console.error('[Predict] hypertension context error:', error.message);
    return res.status(500).json({ error: 'Failed to load hypertension context' });
  }
});

router.post('/hypertension', async (req, res) => {
  try {
    const values = req.body || {};
    const result = await buildHypertensionResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values,
      userMessage: 'Check my hypertension risk.',
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json(result);
  } catch (error) {
    console.error('[Predict] hypertension prediction error:', error.message);
    const status = String(error.message || '').includes('artifacts are missing') ? 503 : 500;
    return res.status(status).json({ error: error.message || 'Failed to predict hypertension risk' });
  }
});

router.post('/hypertension/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    if (isHypertensionAdviceRequest(message)) {
      const advice = await buildHealthAdviceResponse({
        userId: req.user.id,
        userRole: req.user.role || 'user',
        question: message,
        riskType: 'Hypertension',
        latestPrediction: req.body?.latestPrediction || {},
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });

      return res.json({
        conversationId: advice.conversationId,
        reply: advice.answer,
        sources: advice.sources,
        safetyNote: advice.safetyNote,
        updatedValues: {},
        shouldPredict: false,
        advice,
      });
    }

    const extractedValues = extractHypertensionValuesFromMessage(message);
    const shouldPredict =
      /check\s+my\s+hypertension\s+risk|hypertension.*(?:predict|risk)|blood\s*pressure|bp|predict|risk/i.test(message) ||
      Object.keys(extractedValues).length > 0;

    if (!shouldPredict) {
      const reply = 'I can update health values and explain your current hypertension risk. Try: "my BP is 145 over 90", "my cholesterol is 240", or "my weight is 60kg".';
      const conversationId = await saveHypertensionChatHistory(req.user.id, 'user', message, reply, {
        intent: 'hypertension_help_prompt',
        conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
      });
      return res.json({
        conversationId,
        reply,
        updatedValues: {},
        shouldPredict: false,
      });
    }

    const result = await buildHypertensionResponseWithSummary({
      userId: req.user.id,
      userRole: req.user.role || 'user',
      values: extractedValues,
      userMessage: message,
      conversationId: req.body?.conversationId ? Number(req.body.conversationId) : null,
    });

    return res.json({
      conversationId: result.conversationId,
      reply: result.summary,
      updatedValues: extractedValues,
      shouldPredict: true,
      prediction: {
        riskType: result.riskType,
        riskLevel: result.riskLevel,
        confidence: result.confidence,
        selectedAlgorithm: result.selectedAlgorithm,
        factors: result.factors,
        summary: result.summary,
      },
    });
  } catch (error) {
    console.error('[Predict] hypertension chat error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to process hypertension chat message' });
  }
});

module.exports = router;
