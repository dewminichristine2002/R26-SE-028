const { query } = require('../db/postgres');

async function getCompletedAdaptiveSessions(userId, days = 30) {
  const result = await query(
    `SELECT session_id AS "sessionId", final_emotional_state AS "finalEmotionalState",
            final_confidence AS "finalConfidence", risk_level AS "riskLevel",
            conversation_engagement AS "conversationEngagement", completed_at AS "completedAt"
     FROM adaptive_chat_sessions
     WHERE user_id = $1 AND is_complete = TRUE AND completed_at IS NOT NULL
       AND completed_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY completed_at DESC LIMIT 100`,
    [userId, String(days)]
  );
  return result.rows;
}

async function getCompletedAdaptiveActivities(userId, days = 30) {
  const result = await query(
    `SELECT attempt_id AS "attemptId", activity_code AS "activityCode", category,
            activity_type AS "activityType", difficulty, accuracy_score AS accuracy,
            response_time_ms AS "responseTimeMs", completion_status AS "completionStatus",
            recommended_next_difficulty AS "nextDifficulty", started_at AS "startedAt",
            completed_at AS "completedAt"
     FROM adaptive_activity_attempts
     WHERE user_id = $1 AND completion_status = 'completed' AND completed_at IS NOT NULL
       AND completed_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY completed_at DESC LIMIT 200`,
    [userId, String(days)]
  );
  return result.rows.map((row) => ({ ...row, accuracy: row.accuracy == null ? null : Number(row.accuracy), responseTimeMs: row.responseTimeMs == null ? null : Number(row.responseTimeMs) }));
}

async function getAdaptiveCaregiverAlerts(userId, days = 30) {
  const result = await query(
    `SELECT alert_id AS "alertId", adaptive_session_id AS "adaptiveSessionId",
            emotional_state AS "emotionalState", risk_level AS "riskLevel",
            alert_type AS "alertType", alert_message AS message,
            matching_concern_count_7d AS occurrences, status, created_at AS "createdAt"
     FROM emotional_caregiver_alerts
     WHERE user_id = $1 AND created_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY created_at DESC LIMIT 100`,
    [userId, String(days)]
  );
  return result.rows;
}

module.exports = { getAdaptiveCaregiverAlerts, getCompletedAdaptiveActivities, getCompletedAdaptiveSessions };
