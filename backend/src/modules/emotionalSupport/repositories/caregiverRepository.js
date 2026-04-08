const { query } = require('../db/postgres');

async function getCaregiverElders(caregiverId) {
  const result = await query(
    `
      SELECT
        ep.elder_user_id AS "elderId",
        COALESCE(ep.display_name, ep.elder_user_id::TEXT) AS "elderName",
        latest.detected_emotion AS "latestEmotion",
        latest.risk_level AS "riskLevel",
        latest.created_at AS "lastCheckInAt",
        (
          SELECT COUNT(*)::INT
          FROM emotional_support_caregiver_alerts alerts
          WHERE alerts.caregiver_user_id = $1
            AND alerts.elder_user_id = ep.elder_user_id
            AND alerts.status = 'open'
        ) AS "openAlertCount"
      FROM emotional_support_elder_profiles ep
      LEFT JOIN LATERAL (
        SELECT detected_emotion, risk_level, created_at
        FROM emotional_support_emotion_sessions sessions
        WHERE sessions.elder_user_id = ep.elder_user_id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE $1 = ANY(ep.caregiver_user_ids)
      ORDER BY latest.created_at DESC NULLS LAST, "elderName" ASC
    `,
    [caregiverId]
  );

  return result.rows;
}

async function getCaregiverElderDetail(caregiverId, elderId) {
  const profileResult = await query(
    `
      SELECT
        elder_user_id AS "elderId",
        COALESCE(display_name, elder_user_id::TEXT) AS name,
        age,
        living_status AS "livingStatus"
      FROM emotional_support_elder_profiles
      WHERE elder_user_id = $1
        AND $2 = ANY(caregiver_user_ids)
      LIMIT 1
    `,
    [elderId, caregiverId]
  );

  if (!profileResult.rows[0]) {
    return null;
  }

  const summaryResult = await query(
    `
      WITH recent_sessions AS (
        SELECT
          detected_emotion,
          CASE
            WHEN detected_emotion IN ('sad', 'lonely', 'stressed') THEN 1
            ELSE 0
          END AS is_negative
        FROM emotional_support_emotion_sessions
        WHERE elder_user_id = $1
          AND created_at >= NOW() - INTERVAL '7 days'
      )
      SELECT
        COALESCE((
          SELECT detected_emotion
          FROM (
            SELECT detected_emotion, COUNT(*) AS total
            FROM recent_sessions
            GROUP BY detected_emotion
            ORDER BY total DESC, detected_emotion ASC
            LIMIT 1
          ) dominant
        ), 'neutral') AS "dominantEmotion7d",
        COALESCE((SELECT SUM(is_negative) FROM recent_sessions), 0)::INT AS "negativeMoodCount7d",
        COALESCE((
          SELECT COUNT(*)::FLOAT / 7
          FROM recent_sessions
        ), 0)::FLOAT AS "checkInCompletionRate7d",
        (
          SELECT COUNT(*)::INT
          FROM emotional_support_caregiver_alerts
          WHERE elder_user_id = $1
            AND caregiver_user_id = $2
            AND status = 'open'
        ) AS "openAlerts"
    `,
    [elderId, caregiverId]
  );

  const sessionsResult = await query(
    `
      SELECT
        id AS "sessionId",
        detected_emotion AS "detectedEmotion",
        risk_level AS "riskLevel",
        created_at AS "createdAt"
      FROM emotional_support_emotion_sessions
      WHERE elder_user_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [elderId]
  );

  return {
    elder: profileResult.rows[0],
    summary: summaryResult.rows[0],
    sessions: sessionsResult.rows,
  };
}

module.exports = {
  getCaregiverElderDetail,
  getCaregiverElders,
};
