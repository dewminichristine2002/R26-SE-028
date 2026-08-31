const { query, withTransaction } = require('../db/postgres');
const { getTaskItems } = require('../data/cognitiveActivityBank');

function bankActivityType(activityCode) {
  return String(activityCode || '').replace(/_(easy|medium)$/, '');
}

function rotate(values, offset) {
  if (!values?.length) return values;
  const index = offset % values.length;
  return [...values.slice(index), ...values.slice(0, index)];
}

function buildTaskSnapshot({ activityCode, difficulty, priorCount }) {
  const activityType = bankActivityType(activityCode);
  const bank = getTaskItems(activityType, difficulty);
  if (!bank.length) return null;
  const totalItems = difficulty === 'medium' ? 4 : 3;
  const start = (priorCount * totalItems) % bank.length;
  const items = Array.from({ length: totalItems }, (_value, index) => {
    const source = bank[(start + index) % bank.length];
    return { ...source, options: rotate(source.options, start + index) };
  });
  return { bankVersion: 'cognitive-bank-v1', activityCode, activityType, difficulty, totalItems, items };
}

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

async function findActiveSelfSelectedAttempt({ userId, activityCode }, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT attempt_id AS "attemptId", user_id AS "userId", adaptive_session_id AS "sessionId",
            activity_code AS "activityCode", activity_source AS "activitySource", category,
            activity_type AS "activityType", difficulty, task_snapshot AS "taskSnapshot",
            completion_status AS "completionStatus", started_at AS "startedAt"
     FROM adaptive_activity_attempts
     WHERE user_id = $1 AND activity_code = $2 AND activity_source = 'self_selected'
       AND completed_at IS NULL LIMIT 1`,
    [userId, activityCode]
  );
  return mapAttempt(result.rows[0]);
}

async function listSelfSelectableActivities(client = null) {
  const executor = client || { query };
  const result = await executor.query(`
    SELECT activity_type AS "activityCode", MIN(activity_title) AS title,
           MIN(short_description) AS description, MIN(instruction_text) AS instructions,
           ARRAY_AGG(DISTINCT difficulty ORDER BY difficulty) AS "supportedDifficulties",
           MIN(estimated_duration_minutes) AS "estimatedDurationMinutes"
    FROM support_activities
    WHERE is_active = TRUE AND category = 'cognitive_engagement'
      AND activity_type IN (
        'word_category', 'odd_one_out', 'word_completion', 'pattern_sequence',
        'short_memory_recall', 'orientation_activity', 'simple_math', 'sequence_ordering'
      )
    GROUP BY activity_type
    ORDER BY MIN(activity_id)
  `);
  return result.rows.map((row) => ({ ...row, estimatedDurationMinutes: Number(row.estimatedDurationMinutes || 2) }));
}

async function getSelfSelectedDifficulty(userId, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT recommended_next_difficulty AS difficulty FROM adaptive_activity_attempts
     WHERE user_id = $1 AND category = 'cognitive_engagement' AND completed_at IS NOT NULL
       AND recommended_next_difficulty IN ('easy', 'medium')
     ORDER BY completed_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.difficulty || 'easy';
}

async function startActivityAttempt({ userId, sessionId, activityCode }) {
  return withTransaction(async (client) => {
    const existing = await findActiveAttempt({ userId, sessionId, activityCode }, client);
    if (existing) return { ...existing, reused: true };
    const selected = await client.query(
      `SELECT session.user_id AS "userId", session.session_id AS "sessionId",
              activity.activity_id AS "activityId", activity.activity_key AS "activityCode",
              activity.category, activity.activity_type AS "activityType", activity.difficulty,
              activity.task_definition AS "taskDefinition"
       FROM adaptive_chat_sessions session
       JOIN support_activities activity ON activity.activity_key = session.recommended_activity
       WHERE session.session_id = $1 AND session.user_id = $2 AND session.is_complete = TRUE
         AND activity.activity_key = $3 AND activity.is_active = TRUE`,
      [sessionId, userId, activityCode]
    );
    if (!selected.rows[0]) throw Object.assign(new Error('The activity is not the completed session recommendation.'), { status: 409 });
    const activity = selected.rows[0];
    const history = await client.query(
      `SELECT COUNT(*)::integer AS count FROM adaptive_activity_attempts
       WHERE user_id = $1 AND activity_code = $2 AND completed_at IS NOT NULL`,
      [userId, activityCode]
    );
    const taskSnapshot = buildTaskSnapshot({ activityCode, difficulty: activity.difficulty, priorCount: Number(history.rows[0]?.count || 0) }) || activity.taskDefinition;
    const result = await client.query(
      `INSERT INTO adaptive_activity_attempts (
         user_id, adaptive_session_id, activity_id, activity_code, category,
         activity_type, difficulty, task_snapshot, activity_source
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'recommended')
       RETURNING attempt_id AS "attemptId", user_id AS "userId", adaptive_session_id AS "sessionId",
                 activity_code AS "activityCode", category, activity_type AS "activityType", difficulty,
                 task_snapshot AS "taskSnapshot", completion_status AS "completionStatus", started_at AS "startedAt"`,
      [userId, sessionId, activity.activityId, activityCode, activity.category, activity.activityType,
        activity.difficulty, JSON.stringify(taskSnapshot)]
    );
    return mapAttempt(result.rows[0]);
  });
}

async function startSelfSelectedActivityAttempt({ userId, activityCode }) {
  return withTransaction(async (client) => {
    const preferredDifficulty = await getSelfSelectedDifficulty(userId, client);
    const selected = await client.query(
      `SELECT activity_id AS "activityId", activity_key AS "activityCode", category,
              activity_type AS "activityType", difficulty, task_definition AS "taskDefinition"
       FROM support_activities
       WHERE is_active = TRUE AND category = 'cognitive_engagement'
         AND (activity_type = $1 OR activity_key = $1) AND difficulty IN ($2, 'easy')
       ORDER BY CASE WHEN difficulty = $2 THEN 0 ELSE 1 END, activity_id ASC LIMIT 1`,
      [activityCode, preferredDifficulty]
    );
    if (!selected.rows[0]) throw Object.assign(new Error('This cognitive activity is not available.'), { status: 404 });
    const activity = selected.rows[0];
    const existing = await findActiveSelfSelectedAttempt({ userId, activityCode: activity.activityCode }, client);
    if (existing) return { ...existing, reused: true };
    const history = await client.query(
      `SELECT COUNT(*)::integer AS count FROM adaptive_activity_attempts
       WHERE user_id = $1 AND activity_type = $2 AND completed_at IS NOT NULL`,
      [userId, activity.activityType]
    );
    const taskSnapshot = buildTaskSnapshot({ activityCode: activity.activityCode, difficulty: activity.difficulty, priorCount: Number(history.rows[0]?.count || 0) }) || activity.taskDefinition;
    const result = await client.query(
      `INSERT INTO adaptive_activity_attempts (
         user_id, adaptive_session_id, activity_id, activity_code, category,
         activity_type, difficulty, task_snapshot, activity_source
       ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7::jsonb, 'self_selected')
       RETURNING attempt_id AS "attemptId", user_id AS "userId", adaptive_session_id AS "sessionId",
                 activity_code AS "activityCode", activity_source AS "activitySource", category,
                 activity_type AS "activityType", difficulty, task_snapshot AS "taskSnapshot",
                 completion_status AS "completionStatus", started_at AS "startedAt"`,
      [userId, activity.activityId, activity.activityCode, activity.category, activity.activityType,
        activity.difficulty, JSON.stringify(taskSnapshot)]
    );
    return mapAttempt(result.rows[0]);
  });
}

async function getAttemptForUpdate(client, attemptId, userId) {
  const result = await client.query(
    `SELECT attempt.attempt_id AS "attemptId", attempt.user_id AS "userId",
            attempt.adaptive_session_id AS "sessionId", attempt.activity_code AS "activityCode",
            attempt.category, attempt.activity_type AS "activityType", attempt.difficulty,
            attempt.activity_source AS "activitySource",
            attempt.task_snapshot AS "taskSnapshot", attempt.completion_status AS "completionStatus",
            attempt.started_at AS "startedAt", attempt.completed_at AS "completedAt",
            session.final_emotional_state AS "finalEmotionalState", session.risk_level AS "riskLevel",
            session.conversation_engagement AS "conversationEngagement"
     FROM adaptive_activity_attempts attempt
     LEFT JOIN adaptive_chat_sessions session ON session.session_id = attempt.adaptive_session_id
     WHERE attempt.attempt_id = $1 AND attempt.user_id = $2 FOR UPDATE OF attempt`,
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
       activity_type AS "activityType", activity_source AS "activitySource", difficulty, is_correct AS "isCorrect",
       accuracy_score AS accuracy, response_time_ms AS "responseTimeMs", user_response AS response,
       completion_status AS "completionStatus", recommended_next_difficulty AS "nextDifficulty",
       started_at AS "startedAt", completed_at AS "completedAt"`,
    [attemptId, JSON.stringify(response || {}), isCorrect, accuracy, nextDifficulty, JSON.stringify(explanation || {})]
  );
  if (!result.rows[0]) throw Object.assign(new Error('This attempt has already been completed.'), { status: 409 });
  return mapAttempt(result.rows[0]);
}

module.exports = { buildTaskSnapshot, completeAttempt, findActiveAttempt, findActiveSelfSelectedAttempt, getAttemptForUpdate, getRecentCognitiveAttempts, getSelfSelectedDifficulty, listSelfSelectableActivities, startActivityAttempt, startSelfSelectedActivityAttempt, withTransaction };
