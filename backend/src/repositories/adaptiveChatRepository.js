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
    createdAt: row.createdAt,
  };
}

async function getAdaptiveChatSessionById(sessionId) {
  const result = await query(
    `
      SELECT
        session_id AS "sessionId",
        user_id AS "userId",
        current_state AS "currentState",
        turn_count AS "turnCount",
        is_complete AS "isComplete",
        final_emotional_state AS "finalEmotionalState",
        risk_level AS "riskLevel",
        support_directive AS "supportDirective",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM adaptive_chat_sessions
      WHERE session_id = $1
      LIMIT 1
    `,
    [sessionId]
  );

  return mapSession(result.rows[0]);
}

async function startAdaptiveChatSession(userId, initialState = 'neutral') {
  const result = await query(
    `
      INSERT INTO adaptive_chat_sessions (
        user_id,
        current_state,
        turn_count,
        is_complete
      )
      VALUES ($1, $2, 0, FALSE)
      RETURNING
        session_id AS "sessionId",
        user_id AS "userId",
        current_state AS "currentState",
        turn_count AS "turnCount",
        is_complete AS "isComplete",
        final_emotional_state AS "finalEmotionalState",
        risk_level AS "riskLevel",
        support_directive AS "supportDirective",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `,
    [userId, initialState]
  );

  return mapSession(result.rows[0]);
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
}) {
  const result = await client.query(
    `
      INSERT INTO adaptive_chat_turns (
        session_id,
        question_id,
        user_answer,
        detected_state,
        confidence_score
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        turn_id AS "turnId",
        session_id AS "sessionId",
        question_id AS "questionId",
        user_answer AS "userAnswer",
        detected_state AS "detectedState",
        confidence_score AS "confidenceScore",
        created_at AS "createdAt"
    `,
    [sessionId, questionId, userAnswer, detectedState, confidenceScore]
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

async function saveAdaptiveCaregiverAlert(client, {
  userId,
  alertType,
  alertMessage,
  triggerReason,
  severity,
}) {
  const result = await client.query(
    `
      INSERT INTO emotional_caregiver_alerts (
        user_id,
        alert_type,
        alert_message,
        trigger_reason,
        severity
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        alert_id AS "alertId",
        user_id AS "userId",
        alert_type AS "alertType",
        alert_message AS "alertMessage",
        trigger_reason AS "triggerReason",
        severity,
        created_at AS "createdAt"
    `,
    [userId, alertType, alertMessage, triggerReason, severity]
  );

  return result.rows[0];
}

async function runAdaptiveChatTransaction(callback) {
  return withTransaction(callback);
}

module.exports = {
  getAdaptiveChatSessionById,
  getUsedQuestionIds,
  insertAdaptiveChatTurn,
  runAdaptiveChatTransaction,
  saveAdaptiveCaregiverAlert,
  saveAdaptiveNarrativeLog,
  startAdaptiveChatSession,
  updateAdaptiveChatSession,
};
