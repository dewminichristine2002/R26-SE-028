const { query } = require('../db/postgres');

async function getResponseTemplate({ detectedEmotion, riskLevel }) {
  const exactMatchResult = await query(
    `
      SELECT
        id,
        emotion_category AS "emotionCategory",
        response_type AS "responseType",
        target_risk_level AS "targetRiskLevel",
        response_text AS "responseText",
        follow_up_prompt AS "followUpPrompt"
      FROM response_bank
      WHERE is_active = TRUE
        AND emotion_category = $1
        AND (target_risk_level = $2 OR target_risk_level IS NULL)
      ORDER BY
        CASE
          WHEN target_risk_level = $2 THEN 0
          ELSE 1
        END,
        created_at ASC
      LIMIT 1
    `,
    [detectedEmotion, riskLevel]
  );

  if (exactMatchResult.rows[0]) {
    return exactMatchResult.rows[0];
  }

  const fallbackResult = await query(
    `
      SELECT
        id,
        emotion_category AS "emotionCategory",
        response_type AS "responseType",
        target_risk_level AS "targetRiskLevel",
        response_text AS "responseText",
        follow_up_prompt AS "followUpPrompt"
      FROM response_bank
      WHERE is_active = TRUE
        AND emotion_category = 'neutral'
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return fallbackResult.rows[0] || null;
}

module.exports = {
  getResponseTemplate,
};
