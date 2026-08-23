const { query } = require('../db/postgres');

function executor(client) {
  return client || { query };
}

async function lockConcernEpisode(client, userId, emotionalState) {
  await client.query(
    `SELECT pg_advisory_xact_lock($1, hashtext($2))`,
    [Number(userId), `adaptive-risk:${emotionalState}`]
  );
}

async function countMatchingCompletedSessions({ userId, emotionalState, completedAt, days = 7 }, client = null) {
  const result = await executor(client).query(
    `SELECT COUNT(*)::INT AS count
     FROM adaptive_chat_sessions
     WHERE user_id = $1
       AND final_emotional_state = $2
       AND is_complete = TRUE
       AND completed_at IS NOT NULL
       AND completed_at >= $3::TIMESTAMP - ($4::TEXT || ' days')::INTERVAL
       AND completed_at <= $3::TIMESTAMP`,
    [userId, emotionalState, completedAt, String(days)]
  );
  return Number(result.rows[0]?.count || 0);
}

async function findRecentMatchingAlert({ userId, emotionalState, completedAt, days = 7 }, client = null) {
  const result = await executor(client).query(
    `SELECT alert_id AS "alertId", status, created_at AS "createdAt"
     FROM emotional_caregiver_alerts
     WHERE user_id = $1
       AND emotional_state = $2
       AND alert_type = 'repeated_emotional_concern'
       AND created_at >= $3::TIMESTAMP - ($4::TEXT || ' days')::INTERVAL
       AND created_at <= $3::TIMESTAMP
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, emotionalState, completedAt, String(days)]
  );
  return result.rows[0] || null;
}

async function createAdaptiveCaregiverAlert(client, {
  userId, adaptiveSessionId, emotionalState, matchingConcernCount7d,
  message, explanation,
}) {
  const result = await client.query(
    `INSERT INTO emotional_caregiver_alerts (
       user_id, adaptive_session_id, emotional_state, risk_level,
       alert_type, alert_message, trigger_reason, severity,
       matching_concern_count_7d, status, explanation
     )
     VALUES ($1, $2, $3, 'high', 'repeated_emotional_concern', $4,
       'Same aggregate emotional concern recorded at least 3 times within 7 days.',
       'high', $5, 'unread', $6::JSONB)
     ON CONFLICT (adaptive_session_id, alert_type)
       WHERE adaptive_session_id IS NOT NULL DO NOTHING
     RETURNING alert_id AS "alertId", user_id AS "userId",
       adaptive_session_id AS "adaptiveSessionId", emotional_state AS "emotionalState",
       risk_level AS "riskLevel", alert_type AS "alertType",
       alert_message AS message, matching_concern_count_7d AS "occurrences",
       status, explanation, created_at AS "createdAt"`,
    [userId, adaptiveSessionId, emotionalState, message, matchingConcernCount7d, JSON.stringify(explanation)]
  );
  return result.rows[0] || null;
}

async function getAdaptiveCaregiverAlerts(userId, { days = 30, limit = 100 } = {}) {
  const result = await query(
    `SELECT alert_id AS "alertId", user_id AS "userId",
       adaptive_session_id AS "adaptiveSessionId", emotional_state AS "emotionalState",
       risk_level AS "riskLevel", alert_type AS "alertType", alert_message AS message,
       matching_concern_count_7d AS occurrences, status, explanation,
       created_at AS "createdAt"
     FROM emotional_caregiver_alerts
     WHERE user_id = $1
       AND created_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, String(days), limit]
  );
  return result.rows;
}

module.exports = {
  countMatchingCompletedSessions,
  createAdaptiveCaregiverAlert,
  findRecentMatchingAlert,
  getAdaptiveCaregiverAlerts,
  lockConcernEpisode,
};
