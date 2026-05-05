const { analyzeCheckIn } = require('../services/emotionAnalysisService');
const { selectIntervention } = require('../services/interventionService');
const { calculateRiskLevel } = require('../utils/riskCalculator');
const { validateCheckInPayload } = require('../validators/checkInValidator');
const {
  createCheckInRecord,
  getChatLogs: fetchChatLogs,
  getHistory: fetchEmotionHistory,
  getNegativeMoodCount,
  getTrendSummary: fetchTrendSummary,
} = require('../repositories/sessionRepository');
const { getNextActivityByEmotion } = require('../repositories/activityRepository');
const { getProfileByElderId } = require('../repositories/profileRepository');
const { createAlertsForCaregivers } = require('../repositories/alertRepository');
const { evaluateAlertNeed } = require('../services/alertService');

async function createCheckIn(req, res) {
  try {
    const validation = validateCheckInPayload(req.body);

    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const analysis = await analyzeCheckIn(req.body);
    const negativeMoodCount7d = await getNegativeMoodCount(req.body.elderId, 7);
    const riskLevel = calculateRiskLevel({
      detectedEmotion: analysis.detectedEmotion,
      lonelinessScore: analysis.lonelinessScore,
      stressScore: analysis.stressScore,
      negativeMoodCount7d,
    });
    const activity = await getNextActivityByEmotion(analysis.detectedEmotion);
    const recommendation = await selectIntervention({
      detectedEmotion: analysis.detectedEmotion,
      riskLevel,
    });
    const profile = await getProfileByElderId(req.body.elderId);
    const contextSnapshot = {
      missedMedicationCount7d: 0,
      previousNegativeMoodCount7d: negativeMoodCount7d,
      lastDetectedEmotion: null,
    };

    const created = await createCheckInRecord({
      elderId: req.body.elderId,
      inputMode: req.body.inputMode,
      checkInType: req.body.checkInType,
      emoji: req.body.emoji,
      text: req.body.text,
      transcript: req.body.transcript,
      audioUrl: req.body.audioUrl,
      analysis,
      riskLevel,
      contextSnapshot,
      intervention: recommendation.intervention,
      activity,
    });

    const alertPayload = evaluateAlertNeed({
      elderId: req.body.elderId,
      caregiverId: null,
      detectedEmotion: analysis.detectedEmotion,
      riskLevel,
    });
    const createdAlerts = await createAlertsForCaregivers({
      elderId: req.body.elderId,
      caregiverIds: profile?.caregiverIds || [],
      sessionId: created.session.id,
      alertPayload,
      explanation: {
        negativeMoodCount7d,
        detectedEmotion: analysis.detectedEmotion,
        stressScore: analysis.stressScore,
        lonelinessScore: analysis.lonelinessScore,
      },
    });

    return res.status(201).json({
      sessionId: created.session.id,
      detectedEmotion: analysis.detectedEmotion,
      confidence: analysis.confidence,
      scores: {
        sentimentScore: analysis.sentimentScore,
        stressScore: analysis.stressScore,
        lonelinessScore: analysis.lonelinessScore,
      },
      riskLevel,
      chatbotReply: created.intervention.responseText,
      intervention: created.intervention,
      activity,
      alertsCreated: createdAlerts.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to create emotional check-in.',
      details: error.message,
    });
  }
}

async function getHistory(req, res) {
  try {
    const { elderId } = req.params;
    const limit = Number(req.query.limit || 20);
    const items = await fetchEmotionHistory(elderId, limit);

    return res.json({
      elderId,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch emotional history.',
      details: error.message,
    });
  }
}

async function getTrendSummary(req, res) {
  try {
    const { elderId } = req.params;
    const summary = await fetchTrendSummary(elderId);
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch trend summary.',
      details: error.message,
    });
  }
}

async function getChatLogs(req, res) {
  try {
    const { sessionId } = req.params;
    const items = await fetchChatLogs(sessionId);

    return res.json({
      sessionId,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch chat logs.',
      details: error.message,
    });
  }
}

module.exports = {
  createCheckIn,
  getChatLogs,
  getHistory,
  getTrendSummary,
};
