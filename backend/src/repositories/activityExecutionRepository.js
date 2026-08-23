const { query, withTransaction } = require('../db/postgres');

function mapAttempt(row) {
  if (!row) return null;
  return { ...row, accuracy: row.accuracy == null ? null : Number(row.accuracy), responseTimeMs: row.responseTimeMs == null ? null : Number(row.responseTimeMs) };
}

async function findActiveAttempt({ userId, sessionId, activityCode }, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT attempt_id AS "attemptId", user_id AS "userId", adaptive_session_id AS "sessionId",
            activity_code AS "activityCode", category, activity_type AS "activityType", difficulty,
            task_snapshot AS "taskSnapshot", completion_status AS "completionStatus", started_at AS "startedAt"
     FROM adaptive_activity_attempts WHERE user_id = $1 AND adaptive_session_id = $2
       AND activity_code = $3 AND completed_at IS NULL LIMIT 1`,
    [userId, sessionId, activityCode]
  );
  return mapAttempt(result.rows[0]);
}

async function startActivityAttempt({ userId, sessionId, activityCode }) {
  return withTransaction(async (client) => {
    const existing = await findActiveAttempt({ userId, sessionId, activityCode }, client);
    if (existing) return { ...existing, reused: true };
    const result = await client.query(
      `INSERT INTO adaptive_activity_attempts (
         user_id, adaptive_session_id, activity_id, activity_code, category,
         activity_type, difficulty, task_snapshot
       )
       SELECT session.user_id, session.session_id, activity.activity_id, activity.activity_key,
              activity.category, activity.activity_type, activity.difficulty, activity.task_definition
       FROM adaptive_chat_sessions session
       JOIN support_activities activity ON activity.activity_key = session.recommended_activity
       WHERE session.session_id = $1 AND session.user_id = $2 AND session.is_complete = TRUE
         AND activity.activity_key = $3 AND activity.is_active = TRUE
       RETURNING attempt_id AS "attemptId", user_id AS "userId", adaptive_session_id AS "sessionId",
                 activity_code AS "activityCode", category, activity_type AS "activityType", difficulty,
                 task_snapshot AS "taskSnapshot", completion_status AS "completionStatus", started_at AS "startedAt"`,
      [sessionId, userId, activityCode]
    );
    if (!result.rows[0]) throw Object.assign(new Error('The activity is not the completed session recommendation.'), { status: 409 });
    return mapAttempt(result.rows[0]);
  });
}

async function getAttemptForUpdate(client, attemptId, userId) {
  const result = await client.query(
    `SELECT attempt.attempt_id AS "attemptId", attempt.user_id AS "userId",
            attempt.adaptive_session_id AS "sessionId", attempt.activity_code AS "activityCode",
            attempt.category, attempt.activity_type AS "activityType", attempt.difficulty,
            attempt.task_snapshot AS "taskSnapshot", attempt.completion_status AS "completionStatus",
            attempt.started_at AS "startedAt", attempt.completed_at AS "completedAt",
            session.final_emotional_state AS "finalEmotionalState", session.risk_level AS "riskLevel",
            session.conversation_engagement AS "conversationEngagement"
     FROM adaptive_activity_attempts attempt
     JOIN adaptive_chat_sessions session ON session.session_id = attempt.adaptive_session_id
     WHERE attempt.attempt_id = $1 AND attempt.user_id = $2 FOR UPDATE`,
    [attemptId, userId]
  );
  return mapAttempt(result.rows[0]);
}

async function getRecentCognitiveAttempts(userId, limit = 5, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT activity_type AS "activityType", difficulty, accuracy_score AS accuracy,
            completion_status AS "completionStatus", response_time_ms AS "responseTimeMs", completed_at AS "completedAt"
     FROM adaptive_activity_attempts
     WHERE user_id = $1 AND category = 'cognitive_engagement' AND completed_at IS NOT NULL
       AND accuracy_score IS NOT NULL ORDER BY completed_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map(mapAttempt);
}

async function completeAttempt(client, { attemptId, response, isCorrect, accuracy, responseTimeMs, nextDifficulty, explanation }) {
  const result = await client.query(
    `UPDATE adaptive_activity_attempts SET user_response = $2::jsonb, is_correct = $3,
       accuracy_score = $4,
       response_time_ms = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::INTEGER),
       completion_status = 'completed',
       recommended_next_difficulty = $5, difficulty_explanation = $6::jsonb, completed_at = NOW()
     WHERE attempt_id = $1 AND completed_at IS NULL
     RETURNING attempt_id AS "attemptId", activity_code AS "activityCode", category,
       activity_type AS "activityType", difficulty, is_correct AS "isCorrect",
       accuracy_score AS accuracy, response_time_ms AS "responseTimeMs",
       completion_status AS "completionStatus", recommended_next_difficulty AS "nextDifficulty",
       started_at AS "startedAt", completed_at AS "completedAt"`,
    [attemptId, JSON.stringify(response || {}), isCorrect, accuracy, nextDifficulty, JSON.stringify(explanation || {})]
  );
  if (!result.rows[0]) throw Object.assign(new Error('This attempt has already been completed.'), { status: 409 });
  return mapAttempt(result.rows[0]);
}

module.exports = { completeAttempt, findActiveAttempt, getAttemptForUpdate, getRecentCognitiveAttempts, startActivityAttempt, withTransaction };
