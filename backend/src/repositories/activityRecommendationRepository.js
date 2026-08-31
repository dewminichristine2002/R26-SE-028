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

async function getRecentActivityAttemptHistory(userId, limit = 20, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT activity_type AS "activityType", activity_code AS "activityCode",
            activity_source AS "activitySource", completion_status AS "completionStatus",
            started_at AS "startedAt", completed_at AS "completedAt"
     FROM adaptive_activity_attempts
     WHERE user_id = $1 AND started_at IS NOT NULL
     ORDER BY started_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function getLatestRecommendedCognitiveDifficulty(userId, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `SELECT recommended_next_difficulty AS difficulty
     FROM adaptive_activity_attempts
     WHERE user_id = $1 AND category = 'cognitive_engagement' AND completed_at IS NOT NULL
       AND recommended_next_difficulty IN ('easy', 'medium')
     ORDER BY completed_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.difficulty || null;
}

module.exports = {
  getActiveRoutableActivities,
  getLatestRecommendedCognitiveDifficulty,
  getRecentActivityAttemptHistory,
  getRecentRecommendedActivityCodes,
};
