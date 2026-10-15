const { query, withTransaction } = require('../db/postgres');

function mapSession(row) {
  if (!row) {
    return null;
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    currentState: row.currentState,
    turnCount: Number(row.turnCount || 0),
    isComplete: Boolean(row.isComplete),
    finalEmotionalState: row.finalEmotionalState,
    currentQuestionId: row.currentQuestionId == null ? null : Number(row.currentQuestionId),
    finalConfidence: row.finalConfidence == null ? null : Number(row.finalConfidence),
    conversationEngagement: row.conversationEngagement,
    recommendedActivity: row.recommendedActivity,
    caregiverNotificationRequired: Boolean(row.caregiverNotificationRequired),
    completedAt: row.completedAt,
    riskLevel: row.riskLevel,
    supportDirective: row.supportDirective,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTurn(row) {
  if (!row) {
    return null;
  }

  return {
    turnId: row.turnId,
    sessionId: row.sessionId,
    questionId: row.questionId,
    userAnswer: row.userAnswer,
    detectedState: row.detectedState,
    confidenceScore: row.confidenceScore == null ? null : Number(row.confidenceScore),
    questionNumber: row.questionNumber == null ? null : Number(row.questionNumber),
    questionCode: row.questionCode,
    questionText: row.questionText,
    answerPolarity: row.answerPolarity,
    riskIndicator: row.riskIndicator,
    detectionSource: row.detectionSource,
    modelVersion: row.modelVersion,
    analysisMetadata: row.analysisMetadata,
    selectionMetadata: row.selectionMetadata,
    createdAt: row.createdAt,
  };
}

async function getAdaptiveChatSessionById(sessionId, client = null, { forUpdate = false } = {}) {
  const executor = client || { query };
  const result = await executor.query(
    `
      SELECT
        session_id AS "sessionId",
        user_id AS "userId",
        current_state AS "currentState",
        turn_count AS "turnCount",
        is_complete AS "isComplete",
        final_emotional_state AS "finalEmotionalState",
        current_question_id AS "currentQuestionId",
        final_confidence AS "finalConfidence",
        conversation_engagement AS "conversationEngagement",
        recommended_activity AS "recommendedActivity",
        caregiver_notification_required AS "caregiverNotificationRequired",
        completed_at AS "completedAt",
        risk_level AS "riskLevel",
        support_directive AS "supportDirective",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM adaptive_chat_sessions
      WHERE session_id = $1
      LIMIT 1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [sessionId]
  );

  return mapSession(result.rows[0]);
}

async function startAdaptiveChatSession(userId, initialState = 'neutral', currentQuestionId = null) {
  const result = await query(
    `
      INSERT INTO adaptive_chat_sessions (
        user_id,
        current_state,
        turn_count,
        is_complete,
        current_question_id
      )
      VALUES ($1, $2, 0, FALSE, $3)
      RETURNING
        session_id AS "sessionId",
        user_id AS "userId",
        current_state AS "currentState",
        turn_count AS "turnCount",
        is_complete AS "isComplete",
        final_emotional_state AS "finalEmotionalState",
        current_question_id AS "currentQuestionId",
        final_confidence AS "finalConfidence",
        conversation_engagement AS "conversationEngagement",
        recommended_activity AS "recommendedActivity",
        caregiver_notification_required AS "caregiverNotificationRequired",
        completed_at AS "completedAt",
        risk_level AS "riskLevel",
        support_directive AS "supportDirective",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [userId, initialState, currentQuestionId]
  );

  return mapSession(result.rows[0]);
}

async function getRecentCompletedAdaptiveEmotionHistory(userId, days = 7, limit = 10, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT final_emotional_state AS "detectedEmotionalState",
            final_confidence AS "confidenceScore", risk_level AS "riskLevel",
            completed_at AS "completedAt"
     FROM adaptive_chat_sessions
     WHERE user_id = $1 AND is_complete = TRUE AND completed_at IS NOT NULL
       AND final_emotional_state IS NOT NULL
       AND completed_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY completed_at DESC
     LIMIT $3`,
    [userId, String(days), limit]
  );
  return result.rows;
}

async function getRecentCompletedQuestionUsage(userId, sessionLimit = 3, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `WITH recent_sessions AS (
       SELECT session_id, ROW_NUMBER() OVER (ORDER BY completed_at DESC, session_id DESC) AS session_rank
       FROM adaptive_chat_sessions
       WHERE user_id = $1 AND is_complete = TRUE AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, session_id DESC
       LIMIT $2
     )
     SELECT turn.question_code AS "questionCode",
            COUNT(*)::INT AS "recentCount",
            MIN(recent.session_rank)::INT AS "mostRecentSessionRank"
     FROM recent_sessions recent
     JOIN adaptive_chat_turns turn ON turn.session_id = recent.session_id
     WHERE turn.question_code IS NOT NULL
     GROUP BY turn.question_code`,
    [userId, sessionLimit]
  );
  return result.rows;
}

async function getAdaptiveChatTurns(sessionId, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT
       turn.turn_id AS "turnId",
       turn.session_id AS "sessionId",
       turn.question_id AS "questionId",
       turn.user_answer AS "userAnswer",
       turn.detected_state AS "detectedState",
       turn.confidence_score AS "confidenceScore",
       turn.question_number AS "questionNumber",
       turn.question_code AS "questionCode",
       turn.question_text AS "questionText",
       turn.answer_polarity AS "answerPolarity",
       turn.risk_indicator AS "riskIndicator",
       turn.detection_source AS "detectionSource",
       turn.model_version AS "modelVersion",
       turn.analysis_metadata AS "analysisMetadata",
       turn.selection_metadata AS "selectionMetadata",
       turn.created_at AS "createdAt",
       bank.assessment_dimension AS "assessmentDimension"
     FROM adaptive_chat_turns turn
     LEFT JOIN adaptive_question_bank bank ON bank.question_id = turn.question_id
     WHERE turn.session_id = $1
     ORDER BY turn.question_number ASC NULLS LAST, turn.created_at ASC, turn.turn_id ASC`,
    [sessionId]
  );

  return result.rows.map((row) => ({ ...mapTurn(row), assessmentDimension: row.assessmentDimension }));
}

async function getUsedQuestionIds(sessionId, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `
      SELECT question_id AS "questionId"
      FROM adaptive_chat_turns
      WHERE session_id = $1
        AND question_id IS NOT NULL
      ORDER BY created_at ASC
    `,
    [sessionId]
  );

  return result.rows.map((row) => Number(row.questionId));
}

async function insertAdaptiveChatTurn(client, {
  sessionId,
  questionId,
  userAnswer,
  detectedState,
  confidenceScore,
  questionNumber,
  questionCode,
  questionText,
  answerPolarity,
  riskIndicator,
  detectionSource,
  modelVersion,
  analysisMetadata,
  selectionMetadata,
}) {
  const result = await client.query(
    `
      INSERT INTO adaptive_chat_turns (
        session_id,
        question_id,
        user_answer,
        detected_state,
        confidence_score,
        question_number,
        question_code,
        question_text,
        answer_polarity,
        risk_indicator,
        detection_source,
        model_version,
        analysis_metadata,
        selection_metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb)
      RETURNING
        turn_id AS "turnId",
        session_id AS "sessionId",
        question_id AS "questionId",
        user_answer AS "userAnswer",
        detected_state AS "detectedState",
        confidence_score AS "confidenceScore",
        question_number AS "questionNumber",
        question_code AS "questionCode",
        question_text AS "questionText",
        answer_polarity AS "answerPolarity",
        risk_indicator AS "riskIndicator",
        detection_source AS "detectionSource",
        model_version AS "modelVersion",
        analysis_metadata AS "analysisMetadata",
        selection_metadata AS "selectionMetadata",
        created_at AS "createdAt"
    `,
    [
      sessionId, questionId, userAnswer, detectedState, confidenceScore,
      questionNumber, questionCode, questionText, answerPolarity, riskIndicator,
      detectionSource, modelVersion,
      analysisMetadata ? JSON.stringify(analysisMetadata) : null,
      selectionMetadata ? JSON.stringify(selectionMetadata) : null,
    ]
  );

  return mapTurn(result.rows[0]);
}

async function updateAdaptiveChatSession(client, sessionId, fields) {
  const updates = [];
  const values = [];

  const fieldMap = {
    currentState: 'current_state',
    turnCount: 'turn_count',
    isComplete: 'is_complete',
    finalEmotionalState: 'final_emotional_state',
    riskLevel: 'risk_level',
    supportDirective: 'support_directive',
    currentQuestionId: 'current_question_id',
    finalConfidence: 'final_confidence',
    conversationEngagement: 'conversation_engagement',
    recommendedActivity: 'recommended_activity',
    caregiverNotificationRequired: 'caregiver_notification_required',
    completedAt: 'completed_at',
  };

  Object.entries(fieldMap).forEach(([inputKey, columnName]) => {
    if (fields[inputKey] === undefined) {
      return;
    }

    values.push(fields[inputKey]);
    updates.push(`${columnName} = $${values.length}`);
  });

  values.push(sessionId);
  updates.push(`updated_at = NOW()`);

  const result = await client.query(
    `
      UPDATE adaptive_chat_sessions
      SET ${updates.join(', ')}
      WHERE session_id = $${values.length}
      RETURNING
        session_id AS "sessionId",
        user_id AS "userId",
        current_state AS "currentState",
        turn_count AS "turnCount",
        is_complete AS "isComplete",
        final_emotional_state AS "finalEmotionalState",
        current_question_id AS "currentQuestionId",
        final_confidence AS "finalConfidence",
        conversation_engagement AS "conversationEngagement",
        recommended_activity AS "recommendedActivity",
        caregiver_notification_required AS "caregiverNotificationRequired",
        completed_at AS "completedAt",
        risk_level AS "riskLevel",
        support_directive AS "supportDirective",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    values
  );

  return mapSession(result.rows[0]);
}

async function saveAdaptiveNarrativeLog(client, {
  userId,
  transcribedNarrative,
  detectedEmotionalState,
  confidenceScore,
  riskLevel,
  supportActivityKey,
  caregiverNotificationRequired,
  supportDirective,
  detectionSource = 'rule_fallback',
  modelVersion = null,
}) {
  const result = await client.query(
    `
      INSERT INTO narrative_logs (
        user_id,
        prompt_id,
        transcribed_narrative,
        detected_emotional_state,
        confidence_score,
        risk_level,
        support_activity_key,
        caregiver_notification_required,
        support_directive,
        detection_source,
        model_version
      )
      VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      RETURNING
        interaction_id AS "interactionId",
        user_id AS "userId",
        prompt_id AS "promptId",
        transcribed_narrative AS "transcribedNarrative",
        detected_emotional_state AS "detectedEmotionalState",
        confidence_score::FLOAT AS "confidenceScore",
        detection_source AS "detectionSource",
        model_version AS "modelVersion",
        risk_level AS "riskLevel",
        support_activity_key AS "supportActivityKey",
        caregiver_notification_required AS "caregiverNotificationRequired",
        support_directive AS "supportDirective",
        logged_at AS "loggedAt"
    `,
    [
      userId,
      transcribedNarrative,
      detectedEmotionalState,
      confidenceScore,
      riskLevel,
      supportActivityKey,
      caregiverNotificationRequired,
      JSON.stringify(supportDirective),
      detectionSource,
      modelVersion,
    ]
  );

  return result.rows[0];
}

async function runAdaptiveChatTransaction(callback) {
  return withTransaction(callback);
}

module.exports = {
  getAdaptiveChatSessionById,
  getAdaptiveChatTurns,
  getRecentCompletedAdaptiveEmotionHistory,
  getRecentCompletedQuestionUsage,
  getUsedQuestionIds,
  insertAdaptiveChatTurn,
  runAdaptiveChatTransaction,
  saveAdaptiveNarrativeLog,
  startAdaptiveChatSession,
  updateAdaptiveChatSession,
};
