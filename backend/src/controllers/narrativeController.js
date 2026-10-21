const { analyzeNarrative } = require('../services/narrativeAnalysisService');
const { getSupportDirective } = require('../services/reminiscenceSupportService');
const {
  buildCaregiverAlertPayload,
  resolveRiskLevel,
} = require('../services/reminiscenceAlertService');
const {
  createNarrativeInteraction,
  getPromptById,
  getRecentConcernCount,
  getSupportActivityByKey,
} = require('../repositories/narrativeRepository');
const { getProfileByElderId } = require('../repositories/profileRepository');
const { createAlertsForCaregivers } = require('../repositories/alertRepository');
const { evaluateAlertNeed } = require('../services/alertService');

function validateProcessNarrativePayload(body) {
  const errors = [];
  const userId = Number(body.user_id);
  const promptId = Number(body.prompt_id);
  const transcribedNarrative =
    typeof body.transcribed_narrative === 'string' ? body.transcribed_narrative.trim() : '';

  if (!Number.isInteger(userId) || userId <= 0) {
    errors.push('user_id is required and must be a positive integer.');
  }

  if (!Number.isInteger(promptId) || promptId <= 0) {
    errors.push('prompt_id is required and must be a positive integer.');
  }

  if (!transcribedNarrative) {
    errors.push('transcribed_narrative is required and cannot be empty.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      userId,
      promptId,
      transcribedNarrative,
    },
  };
}

async function processNarrative(req, res) {
  try {
    const validation = validateProcessNarrativePayload(req.body || {});

    if (!validation.isValid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const { userId, promptId, transcribedNarrative } = validation.value;
    const prompt = await getPromptById(promptId);

    if (!prompt || !prompt.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Active reminiscence prompt was not found.',
      });
    }

    const analysis = await analyzeNarrative(transcribedNarrative);
    const recentSameConcernCount = await getRecentConcernCount({
      userId,
      detectedEmotionalState: analysis.detectedEmotionalState,
      days: 7,
    });
    const riskLevel = resolveRiskLevel({
      detectedEmotionalState: analysis.detectedEmotionalState,
      baseRiskLevel: analysis.baseRiskLevel,
      recentSameConcernCount,
    });
    const emotionalSupportAlertPayload = evaluateAlertNeed({
      elderId: userId,
      caregiverId: null,
      detectedEmotion: analysis.detectedEmotionalState,
      riskLevel,
      negativeMoodCount7d: recentSameConcernCount,
    });
    const caregiverNotificationRequired = riskLevel === 'high' || Boolean(emotionalSupportAlertPayload);
    const { supportActivityKey, supportDirective } = getSupportDirective(
      analysis.detectedEmotionalState
    );
    const supportActivity = await getSupportActivityByKey(supportActivityKey);
    const alertPayload = riskLevel === 'high'
      ? buildCaregiverAlertPayload({
          detectedEmotionalState: analysis.detectedEmotionalState,
          recentSameConcernCount,
        })
      : null;

    const created = await createNarrativeInteraction({
      userId,
      promptId,
      transcribedNarrative,
      detectedEmotionalState: analysis.detectedEmotionalState,
      confidenceScore: analysis.confidenceScore,
      riskLevel,
      supportActivityKey: supportActivity?.activityKey || supportActivityKey,
      caregiverNotificationRequired,
      supportDirective,
      alertPayload,
      detectionSource: analysis.detectionSource,
      modelVersion: analysis.modelVersion,
    });
    let emotionalAlertsCreated = 0;
    if (emotionalSupportAlertPayload) {
      const profile = await getProfileByElderId(userId).catch(() => null);
      const createdAlerts = await createAlertsForCaregivers({
        elderId: userId,
        caregiverIds: profile?.caregiverIds || [],
        sessionId: null,
        alertPayload: emotionalSupportAlertPayload,
        explanation: {
          source: 'reminiscence_narrative',
          detectedEmotion: analysis.detectedEmotionalState,
          recentSameConcernCount,
          riskLevel,
          concernSummary: emotionalSupportAlertPayload.concernSummary || null,
        },
      });
      emotionalAlertsCreated = createdAlerts.length;
    }

    return res.status(201).json({
      success: true,
      detected_emotional_state: created.narrative.detectedEmotionalState,
      confidence_score: created.narrative.confidenceScore,
      detection_source: created.narrative.detectionSource,
      model_version: created.narrative.modelVersion,
      risk_level: created.narrative.riskLevel,
      caregiver_notification_required: created.narrative.caregiverNotificationRequired,
      emotional_alerts_created: emotionalAlertsCreated,
      support_directive: created.narrative.supportDirective,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process reminiscence narrative.',
      details: error.message,
    });
  }
}

module.exports = {
  processNarrative,
};
