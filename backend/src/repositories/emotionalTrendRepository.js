const { query } = require('../db/postgres');

async function getRecentMoodCheckins(userId, limit = 7) {
  const result = await query(
    `
      SELECT
        checkin_id,
        user_id,
        mood_label,
        mood_score,
        reflection_text,
        input_mode,
        logged_at
      FROM mood_checkins
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

async function getRecentNarrativeLogs(userId, limit = 7) {
  const result = await query(
    `
      SELECT
        interaction_id,
        user_id,
        prompt_id,
        transcribed_narrative,
        detected_emotional_state,
        confidence_score::FLOAT AS confidence_score,
        risk_level,
        support_activity_key,
        caregiver_notification_required,
        support_directive,
        logged_at
      FROM narrative_logs
      WHERE user_id = $1
      ORDER BY logged_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

async function getRecentNarrativeLogsWithinDays(userId, days = 7, limit = 10) {
  const result = await query(
    `SELECT
       interaction_id,
       detected_emotional_state,
       confidence_score::FLOAT AS confidence_score,
       risk_level,
       detection_source,
       model_version,
       logged_at
     FROM narrative_logs
     WHERE user_id = $1
       AND logged_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
     ORDER BY logged_at DESC
     LIMIT $3`,
    [userId, String(days), limit]
  );

  return result.rows;
}

async function getEmotionCountsLast7Days(userId) {
  const result = await query(
    `
      SELECT
        detected_emotional_state,
        COUNT(*)::INT AS total
      FROM narrative_logs
      WHERE user_id = $1
        AND logged_at >= NOW() - INTERVAL '7 days'
      GROUP BY detected_emotional_state
      ORDER BY detected_emotional_state ASC
    `,
    [userId]
  );

  return result.rows;
}

async function getLatestCaregiverAlerts(userId, limit = 7) {
  const result = await query(
    `
      SELECT
        alert_id,
        user_id,
        alert_type,
        alert_message,
        trigger_reason,
        severity,
        is_acknowledged,
        created_at
      FROM emotional_caregiver_alerts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, limit]
  );

  return result.rows;
}

module.exports = {
  getEmotionCountsLast7Days,
  getLatestCaregiverAlerts,
  getRecentMoodCheckins,
  getRecentNarrativeLogs,
  getRecentNarrativeLogsWithinDays,
};
