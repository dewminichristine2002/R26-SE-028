const { analyzeNarrative } = require('../services/narrativeAnalysisService');
const { getRecentNarrativeLogs } = require('../repositories/emotionalTrendRepository');
const { getSupportDirective } = require('../services/reminiscenceSupportService');
const { buildCaregiverAlertPayload, resolveRiskLevel } = require('../services/reminiscenceAlertService');
const { getRecentConcernCount } = require('../repositories/narrativeRepository');
const {
  getOpeningQuestion,
  getQuestionByCriteria,
  getQuestionById,
} = require('../repositories/adaptiveQuestionBankRepository');
const {
  getAdaptiveChatSessionById,
  getUsedQuestionIds,
  insertAdaptiveChatTurn,
  runAdaptiveChatTransaction,
  saveAdaptiveCaregiverAlert,
  saveAdaptiveNarrativeLog,
  startAdaptiveChatSession,
  updateAdaptiveChatSession,
} = require('../repositories/adaptiveChatRepository');

const TOTAL_ADAPTIVE_QUESTIONS = 5;
const supportedHistoryStates = new Set([
  'sadness',
  'loneliness',
  'anxiety',
  'anger',
  'cognitive_fog',
  'happiness',
  'neutral',
]);

function validateUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return 'user_id must be a positive integer.';
  }

  return null;
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return 'session_id is required.';
  }

  return null;
}

function validateRespondPayload(body) {
  const errors = [];
  const userId = Number(body.user_id);
  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
  const questionId = Number(body.question_id);
  const answerText = typeof body.answer_text === 'string' ? body.answer_text.trim() : '';

  const userIdError = validateUserId(userId);
  if (userIdError) {
    errors.push(userIdError);
  }

  const sessionIdError = validateSessionId(sessionId);
  if (sessionIdError) {
    errors.push(sessionIdError);
  }

  if (!Number.isInteger(questionId) || questionId <= 0) {
    errors.push('question_id must be a positive integer.');
  }

  if (!answerText) {
    errors.push('answer_text is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      userId,
      sessionId,
      questionId,
      answerText,
    },
  };
}

function mapQuestionForResponse(question) {
  if (!question) {
    return null;
  }

  return {
    question_id: question.questionId,
    question_text: question.questionText,
    response_type: question.responseType,
  };
}

function buildSessionSummary(session, answerText) {
  return [
    `Adaptive chat summary after ${Number(session.turnCount || 0)} turns.`,
    `Latest answer: ${answerText}`,
    session.currentState ? `Detected state: ${session.currentState}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function normalizeState(value) {
  const normalized = String(value || 'neutral').trim().toLowerCase();
  return supportedHistoryStates.has(normalized) ? normalized : 'neutral';
}

function deriveCognitiveEngagementStatus({ detectedState, supportActivityKey, riskLevel }) {
  if (detectedState === 'cognitive_fog' || supportActivityKey === 'memory_puzzle') {
    return 'needs_gentle_support';
  }

  if (riskLevel === 'high') {
    return 'reduced_engagement';
  }

  if (['positive_journal', 'conversation_prompt'].includes(supportActivityKey)) {
    return 'engaged';
  }

  return 'stable';
}

async function pickNextAdaptiveQuestion({ detectedState, riskLevel, usedQuestionIds }) {
  const typePreference =
    riskLevel === 'high'
      ? ['activity_offer', 'confirmation', 'follow_up']
      : ['follow_up', 'confirmation', 'activity_offer'];
  const normalizedState = detectedState === 'neutral' ? 'neutral' : detectedState;

  let question = await getQuestionByCriteria({
    targetState: normalizedState,
    questionTypes: typePreference,
    excludedQuestionIds: usedQuestionIds,
  });

  if (!question && normalizedState !== 'neutral') {
    question = await getQuestionByCriteria({
      targetState: 'neutral',
      questionTypes: typePreference,
      excludedQuestionIds: usedQuestionIds,
    });
  }

  if (!question) {
    question = await getQuestionByCriteria({
      targetState: 'neutral',
      questionTypes: ['follow_up'],
      excludedQuestionIds: usedQuestionIds,
      includeOpening: true,
    });
  }

  if (!question) {
    question = await getQuestionByCriteria({
      targetState: 'neutral',
      questionTypes: ['follow_up', 'confirmation', 'activity_offer'],
      excludedQuestionIds: usedQuestionIds,
      includeOpening: true,
    });
  }

  if (!question) {
    question = await getQuestionByCriteria({
      questionTypes: ['follow_up', 'confirmation', 'activity_offer'],
      excludedQuestionIds: usedQuestionIds,
      includeOpening: true,
    });
  }

  return question;
}

async function pickFirstAdaptiveQuestion({ previousEmotion }) {
  const targetState = normalizeState(previousEmotion);
  const typePreference = ['opening', 'follow_up', 'confirmation', 'activity_offer'];

  let question = await getQuestionByCriteria({
    targetState,
    questionTypes: typePreference,
    excludedQuestionIds: [],
    includeOpening: true,
  });

  if (!question && targetState !== 'neutral') {
    question = await getQuestionByCriteria({
      targetState: 'neutral',
      questionTypes: typePreference,
      excludedQuestionIds: [],
      includeOpening: true,
    });
  }

  if (!question) {
    question = await getOpeningQuestion();
  }

  return question;
}

async function startAdaptiveChat(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const validationError = validateUserId(userId);

    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const recentLogs = await getRecentNarrativeLogs(userId, 1);
    const previousEmotion = normalizeState(recentLogs[0]?.detected_emotional_state);
    const openingQuestion = await pickFirstAdaptiveQuestion({ previousEmotion });

    if (!openingQuestion) {
      return res.status(404).json({
        success: false,
        error: 'No active opening question was found.',
      });
    }

    const session = await startAdaptiveChatSession(userId, previousEmotion);

    return res.status(201).json({
      success: true,
      session_id: session.sessionId,
      previous_emotional_state: previousEmotion,
      question: mapQuestionForResponse(openingQuestion),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to start adaptive chat.',
      details: error.message,
    });
  }
}

async function respondAdaptiveChat(req, res) {
  const validation = validateRespondPayload(req.body || {});

  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      errors: validation.errors,
    });
  }

  const { sessionId, userId, questionId, answerText } = validation.value;

  try {
    const session = await getAdaptiveChatSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Adaptive chat session was not found.',
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'This session does not belong to the supplied user_id.',
      });
    }

    if (session.isComplete) {
      return res.status(409).json({
        success: false,
        error: 'This adaptive chat session is already complete.',
      });
    }

    const question = await getQuestionById(questionId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'The supplied question_id was not found in the question bank.',
      });
    }

    const analysis = await analyzeNarrative(answerText);
    const detectedState =
      analysis.detectedEmotionalState === 'neutral' && session.currentState && session.currentState !== 'neutral'
        ? session.currentState
        : analysis.detectedEmotionalState;
    const baseRiskLevel =
      detectedState !== analysis.detectedEmotionalState && detectedState !== 'happiness' ? 'medium' : analysis.baseRiskLevel;
    const recentSameConcernCount = await getRecentConcernCount({
      userId,
      detectedEmotionalState: detectedState,
      days: 7,
    });
    const riskLevel = resolveRiskLevel({
      detectedEmotionalState: detectedState,
      baseRiskLevel,
      recentSameConcernCount,
    });
    const { supportActivityKey, supportDirective } = getSupportDirective(detectedState);
    const turnCount = Number(session.turnCount || 0) + 1;
    const shouldComplete = turnCount >= TOTAL_ADAPTIVE_QUESTIONS;

    const responsePayload = await runAdaptiveChatTransaction(async (client) => {
      const turn = await insertAdaptiveChatTurn(client, {
        sessionId,
        questionId,
        userAnswer: answerText,
        detectedState,
        confidenceScore: analysis.confidenceScore,
      });

      const updatedSession = await updateAdaptiveChatSession(client, sessionId, {
        currentState: detectedState,
        turnCount,
      });

      if (!shouldComplete) {
        const usedQuestionIds = await getUsedQuestionIds(sessionId, client);
        const nextQuestion = await pickNextAdaptiveQuestion({
          detectedState,
          riskLevel,
          usedQuestionIds,
        });

        if (!nextQuestion) {
          throw new Error('Unable to select the next adaptive question.');
        }

        return {
          session: updatedSession,
          turn,
          nextQuestion,
          isComplete: false,
        };
      }

      const caregiverNotificationRequired = riskLevel === 'high';
      const cognitiveEngagementStatus = deriveCognitiveEngagementStatus({
        detectedState,
        supportActivityKey,
        riskLevel,
      });
      const finalSupportDirective = {
        ...supportDirective,
        cognitive_engagement_status: cognitiveEngagementStatus,
      };
      let alert = null;

      if (caregiverNotificationRequired) {
        const alertPayload = buildCaregiverAlertPayload({
          detectedEmotionalState: detectedState,
          recentSameConcernCount,
        });

        alert = await saveAdaptiveCaregiverAlert(client, {
          userId,
          alertType: alertPayload.alertType,
          alertMessage: alertPayload.alertMessage,
          triggerReason: alertPayload.triggerReason,
          severity: alertPayload.severity,
        });
      }

      const completedSession = await updateAdaptiveChatSession(client, sessionId, {
        currentState: detectedState,
        turnCount,
        isComplete: true,
        finalEmotionalState: detectedState,
        riskLevel,
        supportDirective: finalSupportDirective,
      });

      const narrativeLog = await saveAdaptiveNarrativeLog(client, {
        userId,
        transcribedNarrative: buildSessionSummary(updatedSession, answerText),
        detectedEmotionalState: detectedState,
        confidenceScore: analysis.confidenceScore,
        riskLevel,
        supportActivityKey,
        caregiverNotificationRequired,
        supportDirective: finalSupportDirective,
        detectionSource: analysis.detectionSource,
        modelVersion: analysis.modelVersion,
      });

      return {
        session: completedSession,
        turn,
        narrativeLog,
        alert,
        caregiverNotificationRequired,
        cognitiveEngagementStatus,
        isComplete: true,
      };
    });

    if (!responsePayload.isComplete) {
      return res.json({
        success: true,
        session_id: sessionId,
        is_complete: false,
        current_state: responsePayload.session.currentState,
        turn_count: responsePayload.session.turnCount,
        detected_state: responsePayload.turn.detectedState,
        confidence_score: responsePayload.turn.confidenceScore,
        detection_source: analysis.detectionSource,
        model_version: analysis.modelVersion,
        next_question: mapQuestionForResponse(responsePayload.nextQuestion),
      });
    }

    return res.json({
      success: true,
      session_id: sessionId,
      is_complete: true,
      current_state: responsePayload.session.currentState,
      turn_count: responsePayload.session.turnCount,
      final_emotional_state: responsePayload.session.finalEmotionalState,
      risk_level: responsePayload.session.riskLevel,
      confidence_score: responsePayload.turn.confidenceScore,
      detection_source: analysis.detectionSource,
      model_version: analysis.modelVersion,
      support_directive: responsePayload.session.supportDirective,
      cognitive_engagement_status: responsePayload.cognitiveEngagementStatus,
      caregiver_notification_required: responsePayload.caregiverNotificationRequired,
      narrative_log_id: responsePayload.narrativeLog?.interactionId || null,
      caregiver_alert: responsePayload.alert || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process adaptive chat response.',
      details: error.message,
    });
  }
}

module.exports = {
  respondAdaptiveChat,
  startAdaptiveChat,
};
