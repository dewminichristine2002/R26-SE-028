const { query } = require('../db/postgres');

async function getNextActivityByEmotion(emotion) {
  const exactMatchResult = await query(
    `
      SELECT
        id,
        title,
        activity_type AS type,
        difficulty,
        prompt,
        expected_answer_type AS "expectedAnswerType",
        options,
        estimated_duration_sec AS "estimatedDurationSec"
      FROM emotional_support_cognitive_activities
      WHERE is_active = TRUE
        AND target_emotions @> ARRAY[$1]::TEXT[]
      ORDER BY
        CASE difficulty
          WHEN 'easy' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        created_at ASC
      LIMIT 1
    `,
    [emotion]
  );

  if (exactMatchResult.rows[0]) {
    return exactMatchResult.rows[0];
  }

  const fallbackResult = await query(
    `
      SELECT
        id,
        title,
        activity_type AS type,
        difficulty,
        prompt,
        expected_answer_type AS "expectedAnswerType",
        options,
        estimated_duration_sec AS "estimatedDurationSec"
      FROM emotional_support_cognitive_activities
      WHERE is_active = TRUE
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return fallbackResult.rows[0] || null;
}

async function createActivityAttempt({
  elderId,
  sessionId,
  activityId,
  answerText,
  selectedOption,
  score,
  completionStatus,
}) {
  const result = await query(
    `
      INSERT INTO emotional_support_activity_attempts (
        elder_user_id,
        session_id,
        activity_id,
        answer_text,
        selected_option,
        score,
        completion_status,
        completed_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 = 'completed' THEN NOW() ELSE NULL END)
      RETURNING
        id,
        elder_user_id AS "elderId",
        session_id AS "sessionId",
        activity_id AS "activityId",
        answer_text AS "answerText",
        selected_option AS "selectedOption",
        score,
        completion_status AS "completionStatus",
        started_at AS "startedAt",
        completed_at AS "completedAt"
    `,
    [elderId, sessionId, activityId, answerText || null, selectedOption || null, score ?? null, completionStatus]
  );

  return result.rows[0];
}

module.exports = {
  createActivityAttempt,
  getNextActivityByEmotion,
};
