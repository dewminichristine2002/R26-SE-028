const { analyzeNarrative } = require('../services/narrativeAnalysisService');
const { determineAnswerPolarity } = require('../services/answerPolarityService');
const { interpretContextualAnswer } = require('../services/contextualAnswerInterpretationService');
const { aggregateAdaptiveSessionResult } = require('../services/adaptiveResultAggregator');
const { recommendActivity } = require('../services/activityRecommendationService');
const { getRecentConcernCount } = require('../repositories/narrativeRepository');
const { getProfileByElderId } = require('../repositories/profileRepository');
const { createAlertsForCaregivers } = require('../repositories/alertRepository');
const { evaluateAlertNeed } = require('../services/alertService');
const {
  getRepeatedHistoryState,
  selectFirstAdaptiveQuestion,
  selectNextAdaptiveQuestion,
} = require('../services/adaptiveQuestionSelector');
const { getSupportDirective } = require('../services/reminiscenceSupportService');
const { assessAdaptiveRisk, getBaseRisk } = require('../services/riskAssessmentService');
const { createAdaptiveCaregiverAlert } = require('../repositories/adaptiveRiskRepository');
const { getQuestionById } = require('../repositories/adaptiveQuestionBankRepository');
const {
  getActiveRoutableActivities,
  getLatestRecommendedCognitiveDifficulty,
  getRecentRecommendedActivityCodes,
} = require('../repositories/activityRecommendationRepository');
const {
  getAdaptiveChatSessionById,
  getAdaptiveChatTurns,
  getRecentCompletedAdaptiveEmotionHistory,
  getRecentCompletedQuestionUsage,
  insertAdaptiveChatTurn,
  runAdaptiveChatTransaction,
  saveAdaptiveNarrativeLog,
  startAdaptiveChatSession,
  updateAdaptiveChatSession,
} = require('../repositories/adaptiveChatRepository');

const TOTAL_ADAPTIVE_QUESTIONS = 5;
const HISTORY_DAYS = 7;
const HISTORY_LIMIT = 10;
const supportedStates = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'happiness', 'neutral']);

class AdaptiveChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateUserId(userId) {
  return !Number.isInteger(userId) || userId <= 0 ? 'user_id must be a positive integer.' : null;
}

function validateRespondPayload(body) {
  const errors = [];
  const value = {
    userId: Number(body.user_id),
    sessionId: typeof body.session_id === 'string' ? body.session_id.trim() : '',
    questionId: Number(body.question_id),
    answerText: typeof body.answer_text === 'string' ? body.answer_text.trim() : '',
  };
  if (validateUserId(value.userId)) errors.push('user_id must be a positive integer.');
  if (!value.sessionId) errors.push('session_id is required.');
  if (!Number.isInteger(value.questionId) || value.questionId <= 0) errors.push('question_id must be a positive integer.');
  if (!value.answerText) errors.push('answer_text is required.');
  return { isValid: errors.length === 0, errors, value };
}

function normalizeState(value) {
  const state = String(value || 'neutral').trim().toLowerCase();
  return supportedStates.has(state) ? state : 'neutral';
}

function mapQuestionForResponse(question) {
  if (!question) return null;
  return {
    question_id: question.questionId,
    question_code: question.questionCode,
    question_text: question.questionText,
    response_type: question.responseType,
    quick_replies: question.quickReplies || [],
    assessment_dimension: question.assessmentDimension,
    is_assessment: question.isAssessment,
  };
}

function buildSessionSummary(session, aggregation) {
  return [
    `Adaptive chat summary after ${Number(session.turnCount || 0)} turns.`,
    `Aggregated emotional state: ${aggregation.finalEmotionalState}.`,
    `Aggregate evidence strength: ${aggregation.finalConfidence}.`,
  ].filter(Boolean).join(' ');
}

function deriveCognitiveEngagementStatus({ detectedState, supportActivityKey, riskLevel }) {
  if (detectedState === 'cognitive_fog' || supportActivityKey === 'memory_puzzle') return 'needs_gentle_support';
  if (riskLevel === 'high') return 'reduced_engagement';
  if (['positive_journal', 'conversation_prompt'].includes(supportActivityKey)) return 'engaged';
  return 'stable';
}

function publicSupportDirective(supportDirective) {
  if (!supportDirective) return supportDirective;
  const {
    adaptive_result_aggregation: _researchExplanation,
    activity_selection: _activitySelection,
    risk_assessment: _riskAssessment,
    ...publicFields
  } = supportDirective;
  return publicFields;
}

async function startAdaptiveChat(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const validationError = validateUserId(userId);
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const [recentLogs, recentQuestionUsage] = await Promise.all([
      getRecentCompletedAdaptiveEmotionHistory(userId, HISTORY_DAYS, HISTORY_LIMIT),
      getRecentCompletedQuestionUsage(userId, 3),
    ]);
    const firstSelection = await selectFirstAdaptiveQuestion({ userId, recentEmotionHistory: recentLogs, recentQuestionUsage });
    if (!firstSelection?.question) {
      return res.status(404).json({ success: false, error: 'No active assessment question was found.' });
    }

    const historyState = getRepeatedHistoryState(recentLogs);
    const session = await startAdaptiveChatSession(userId, 'neutral', firstSelection.question.questionId);
    return res.status(201).json({
      success: true,
      session_id: session.sessionId,
      previous_emotional_state: historyState || 'neutral',
      question_number: 1,
      total_questions: TOTAL_ADAPTIVE_QUESTIONS,
      question: mapQuestionForResponse(firstSelection.question),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to start adaptive chat.', details: error.message });
  }
}

async function respondAdaptiveChat(req, res) {
  const validation = validateRespondPayload(req.body || {});
  if (!validation.isValid) return res.status(400).json({ success: false, errors: validation.errors });
  const { sessionId, userId, questionId, answerText } = validation.value;

  try {
    const session = await getAdaptiveChatSessionById(sessionId);
    if (!session) throw new AdaptiveChatError(404, 'Adaptive chat session was not found.');
    if (session.userId !== userId) throw new AdaptiveChatError(403, 'This session does not belong to the supplied user_id.');
    if (session.isComplete) throw new AdaptiveChatError(409, 'This adaptive chat session is already complete.');
    if (!session.currentQuestionId || session.currentQuestionId !== questionId) {
      throw new AdaptiveChatError(409, 'The supplied question_id is not the question currently expected by this session.');
    }

    const question = await getQuestionById(questionId);
    if (!question?.isActive || !question.isAssessment) {
      throw new AdaptiveChatError(409, 'The expected question is not an active assessment question.');
    }

    const existingTurns = await getAdaptiveChatTurns(sessionId);
    const questionNumber = existingTurns.length + 1;
    if (questionNumber > TOTAL_ADAPTIVE_QUESTIONS) {
      throw new AdaptiveChatError(409, 'This session cannot accept more than five assessment answers.');
    }

    const analysis = await analyzeNarrative(answerText);
    const rawTurnState = normalizeState(analysis.detectedEmotionalState);
    const answerPolarity = determineAnswerPolarity(answerText, { detectedEmotion: rawTurnState });
    const previousInterpretedEmotion = existingTurns.at(-1)?.detectedState || session.currentState || 'neutral';
    const interpretation = interpretContextualAnswer({
      question,
      answerText,
      answerPolarity,
      rawMlEmotion: analysis.rawMlEmotion || (analysis.detectionSource === 'ml_model' ? rawTurnState : 'neutral'),
      rawMlConfidence: analysis.rawMlConfidence ?? analysis.confidenceScore,
      rawDetectionSource: analysis.detectionSource,
      fallbackEmotion: analysis.detectionSource === 'rule_fallback' ? rawTurnState : null,
      previousInterpretedEmotion,
    });
    const detectedState = normalizeState(interpretation.interpretedEmotion);
    const interpretedEvidenceConfidence = interpretation.contextualEvidenceWeight ?? analysis.confidenceScore;
    const recentLogs = await getRecentCompletedAdaptiveEmotionHistory(userId, HISTORY_DAYS, HISTORY_LIMIT);
    const recentSameConcernCount = await getRecentConcernCount({
      userId,
      detectedEmotionalState: detectedState,
      days: HISTORY_DAYS,
    });
    // Individual turns use base risk only. Repetition is assessed once, from the
    // completed five-turn aggregate session, by riskAssessmentService.
    const riskLevel = getBaseRisk(detectedState);
    const shouldComplete = questionNumber === TOTAL_ADAPTIVE_QUESTIONS;
    const askedQuestionIds = [...existingTurns.map((turn) => turn.questionId), question.questionId];
    const askedQuestionCodes = [...existingTurns.map((turn) => turn.questionCode), question.questionCode];
    const askedDimensions = [...existingTurns.map((turn) => turn.assessmentDimension), question.assessmentDimension].filter(Boolean);

    const nextSelection = shouldComplete ? null : await selectNextAdaptiveQuestion({
      userId,
      sessionId,
      nextQuestionNumber: questionNumber + 1,
      previousQuestion: question,
      previousAnswer: answerText,
      detectedEmotion: detectedState,
      confidence: interpretedEvidenceConfidence,
      answerPolarity,
      riskIndicator: riskLevel,
      recentEmotionHistory: recentLogs,
      askedQuestionIds,
      askedQuestionCodes,
      askedDimensions,
    });
    if (!shouldComplete && !nextSelection?.question) {
      throw new AdaptiveChatError(409, 'No unused assessment question is available for this session.');
    }

    const responsePayload = await runAdaptiveChatTransaction(async (client) => {
      const lockedSession = await getAdaptiveChatSessionById(sessionId, client, { forUpdate: true });
      if (!lockedSession || lockedSession.isComplete) throw new AdaptiveChatError(409, 'This adaptive chat session is already complete.');
      if (lockedSession.currentQuestionId !== questionId) {
        throw new AdaptiveChatError(409, 'This question has already been answered or is no longer expected.');
      }
      if (lockedSession.turnCount !== existingTurns.length) {
        throw new AdaptiveChatError(409, 'The session changed while this answer was being processed. Please reload it.');
      }

      const turn = await insertAdaptiveChatTurn(client, {
        sessionId,
        questionId,
        userAnswer: answerText,
        detectedState,
        confidenceScore: analysis.confidenceScore,
        questionNumber,
        questionCode: question.questionCode,
        questionText: question.questionText,
        answerPolarity,
        riskIndicator: riskLevel,
        detectionSource: analysis.detectionSource,
        modelVersion: analysis.modelVersion,
        analysisMetadata: {
          baseRiskLevel: analysis.baseRiskLevel,
          ruleScore: analysis.ruleScore,
          ruleScores: analysis.scores || null,
          uncertainty: analysis.uncertainty,
          fallbackReason: analysis.fallbackReason,
          contextualInterpretation: interpretation,
          rawMlEmotion: interpretation.rawMlEmotion,
          rawMlConfidence: interpretation.rawMlConfidence,
          rawDetectionSource: interpretation.rawDetectionSource,
          rawTurnEmotion: rawTurnState,
        },
        selectionMetadata: nextSelection?.selectionReason || { completedAfterQuestion: TOTAL_ADAPTIVE_QUESTIONS },
      });

      if (!shouldComplete) {
        const updatedSession = await updateAdaptiveChatSession(client, sessionId, {
          currentState: detectedState,
          turnCount: questionNumber,
          currentQuestionId: nextSelection.question.questionId,
        });
        return { session: updatedSession, turn, nextQuestion: nextSelection.question, isComplete: false };
      }

      const completedTurns = await getAdaptiveChatTurns(sessionId, client);
      const aggregation = aggregateAdaptiveSessionResult(completedTurns);
      const aggregateState = aggregation.finalEmotionalState;
      const completedAt = new Date();
      await updateAdaptiveChatSession(client, sessionId, {
        currentState: aggregateState,
        turnCount: questionNumber,
        currentQuestionId: null,
        isComplete: true,
        finalEmotionalState: aggregateState,
        finalConfidence: aggregation.finalConfidence,
        conversationEngagement: aggregation.conversationEngagement,
        riskLevel: getBaseRisk(aggregateState),
        completedAt,
      });
      const riskAssessment = await assessAdaptiveRisk({
        userId, finalEmotionalState: aggregateState, completedAt, client,
      });
      const aggregateRiskLevel = riskAssessment.finalRisk;
      const { supportActivityKey, supportDirective } = getSupportDirective(aggregateState);
      const [activities, recentActivityHistory, recommendedDifficulty] = await Promise.all([
        getActiveRoutableActivities(client),
        getRecentRecommendedActivityCodes(userId, 5, client),
        getLatestRecommendedCognitiveDifficulty(userId, client),
      ]);
      const activitySelection = recommendActivity({
        userId,
        finalEmotionalState: aggregateState,
        finalConfidence: aggregation.finalConfidence,
        riskLevel: aggregateRiskLevel,
        conversationEngagement: aggregation.conversationEngagement,
        recentActivityHistory,
        recommendedDifficulty,
        recentEmotionHistory: recentLogs,
        activities,
      });
      const caregiverNotificationRequired = riskAssessment.caregiverNotificationRequired;
      const cognitiveEngagementStatus = deriveCognitiveEngagementStatus({ detectedState: aggregateState, supportActivityKey, riskLevel: aggregateRiskLevel });
      const finalSupportDirective = {
        ...supportDirective,
        cognitive_engagement_status: cognitiveEngagementStatus,
        adaptive_result_aggregation: aggregation.explanation,
        activity_selection: activitySelection.explanation,
        risk_assessment: riskAssessment.explanation,
      };
      let alert = null;
      if (riskAssessment.shouldCreateAlert) {
        alert = await createAdaptiveCaregiverAlert(client, {
          userId,
          adaptiveSessionId: sessionId,
          emotionalState: aggregateState,
          matchingConcernCount7d: riskAssessment.matchingConcernCount7d,
          message: riskAssessment.alertMessage,
          explanation: { ...riskAssessment.explanation, alertCreated: true },
        });
      }
      const completedSession = await updateAdaptiveChatSession(client, sessionId, {
        currentState: aggregateState,
        turnCount: questionNumber,
        currentQuestionId: null,
        isComplete: true,
        finalEmotionalState: aggregateState,
        finalConfidence: aggregation.finalConfidence,
        conversationEngagement: aggregation.conversationEngagement,
        recommendedActivity: activitySelection.recommendation.activity_code,
        riskLevel: aggregateRiskLevel,
        supportDirective: finalSupportDirective,
        caregiverNotificationRequired,
        completedAt,
      });
      const narrativeLog = await saveAdaptiveNarrativeLog(client, {
        userId,
        transcribedNarrative: buildSessionSummary(completedSession, aggregation),
        detectedEmotionalState: aggregateState,
        confidenceScore: aggregation.finalConfidence,
        riskLevel: aggregateRiskLevel,
        supportActivityKey: activitySelection.recommendation.activity_code,
        caregiverNotificationRequired,
        supportDirective: finalSupportDirective,
        detectionSource: 'adaptive_aggregate',
        modelVersion: null,
      });
      return { session: completedSession, turn, narrativeLog, alert, caregiverNotificationRequired, cognitiveEngagementStatus, aggregation, activitySelection, riskAssessment, isComplete: true };
    });

    if (!responsePayload.isComplete) {
      return res.json({
        success: true,
        session_id: sessionId,
        is_complete: false,
        answered_question_number: questionNumber,
        question_number: questionNumber + 1,
        total_questions: TOTAL_ADAPTIVE_QUESTIONS,
        current_state: responsePayload.session.currentState,
        detected_state: responsePayload.turn.detectedState,
        confidence_score: responsePayload.turn.confidenceScore,
        answer_polarity: responsePayload.turn.answerPolarity,
        detection_source: responsePayload.turn.detectionSource,
        model_version: responsePayload.turn.modelVersion,
        next_question: mapQuestionForResponse(responsePayload.nextQuestion),
      });
    }

    let emotionalAlertsCreated = 0;
    const emotionalSupportAlertPayload = evaluateAlertNeed({
      elderId: userId,
      caregiverId: null,
      detectedEmotion: responsePayload.session.finalEmotionalState || responsePayload.turn.detectedState,
      riskLevel: responsePayload.session.riskLevel,
      negativeMoodCount7d: recentSameConcernCount,
    });

    if (emotionalSupportAlertPayload) {
      const profile = await getProfileByElderId(userId).catch(() => null);
      const createdAlerts = await createAlertsForCaregivers({
        elderId: userId,
        caregiverIds: profile?.caregiverIds || [],
        sessionId: null,
        alertPayload: emotionalSupportAlertPayload,
        explanation: {
          source: 'adaptive_support_chat',
          detectedEmotion: responsePayload.session.finalEmotionalState || responsePayload.turn.detectedState,
          recentSameConcernCount,
          riskLevel: responsePayload.session.riskLevel,
          concernSummary: emotionalSupportAlertPayload.concernSummary || null,
        },
      });
      emotionalAlertsCreated = createdAlerts.length;
    }

    return res.json({
      success: true,
      session_id: sessionId,
      is_complete: true,
      answered_question_number: questionNumber,
      question_number: questionNumber,
      total_questions: TOTAL_ADAPTIVE_QUESTIONS,
      current_state: responsePayload.session.currentState,
      turn_count: responsePayload.session.turnCount,
      final_emotional_state: responsePayload.session.finalEmotionalState,
      final_confidence: responsePayload.session.finalConfidence,
      risk_level: responsePayload.session.riskLevel,
      conversation_engagement: responsePayload.session.conversationEngagement,
      recommended_activity: responsePayload.activitySelection.recommendation,
      detection_source: 'adaptive_aggregate',
      model_version: null,
      support_directive: publicSupportDirective(responsePayload.session.supportDirective),
      cognitive_engagement_status: responsePayload.cognitiveEngagementStatus,
      caregiver_notification_required: responsePayload.caregiverNotificationRequired || emotionalAlertsCreated > 0,
      emotional_alerts_created: emotionalAlertsCreated,
      narrative_log_id: responsePayload.narrativeLog?.interactionId || null,
      caregiver_alert: responsePayload.alert || null,
    });
  } catch (error) {
    const status = error.status || (error.code === '23505' ? 409 : 500);
    return res.status(status).json({
      success: false,
      error: status === 500 ? 'Failed to process adaptive chat response.' : error.message,
      ...(status === 500 ? { details: error.message } : {}),
    });
  }
}

module.exports = { mapQuestionForResponse, respondAdaptiveChat, startAdaptiveChat };
