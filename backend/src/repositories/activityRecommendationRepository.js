const { query } = require('../db/postgres');

async function getActiveRoutableActivities(client = null) {
  const executor = client || { query };
  const result = await executor.query(`
    SELECT activity_key AS "activityCode", activity_title AS title,
           category, activity_type AS "activityType", target_emotion AS "targetState",
           difficulty, estimated_duration_minutes AS "estimatedDurationMinutes",
           short_description AS description, instruction_text AS instructions
    FROM support_activities
    WHERE is_active = TRUE AND category IS NOT NULL
    ORDER BY activity_key ASC
  `);
  return result.rows.map((row) => ({ ...row, estimatedDurationMinutes: Number(row.estimatedDurationMinutes) }));
}

async function getRecentRecommendedActivityCodes(userId, limit = 5, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT recommended_activity AS "activityCode"
     FROM adaptive_chat_sessions
     WHERE user_id = $1 AND is_complete = TRUE AND recommended_activity IS NOT NULL
     ORDER BY completed_at DESC NULLS LAST, updated_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows.map((row) => row.activityCode);
}

module.exports = { getActiveRoutableActivities, getRecentRecommendedActivityCodes };
