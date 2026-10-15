const { query, withTransaction } = require('../db/postgres');

async function getPromptById(promptId) {
  const result = await query(
    `
      SELECT
        prompt_id AS "promptId",
        prompt_code AS "promptCode",
        title,
        prompt_text AS "promptText",
        category,
        historical_era AS "historicalEra",
        is_active AS "isActive"
      FROM reminiscence_prompts
      WHERE prompt_id = $1
      LIMIT 1
    `,
    [promptId]
  );

  return result.rows[0] || null;
}

async function getRecentConcernCount({ userId, detectedEmotionalState, days = 7 }, client = null) {
  const executor = client || { query };
  const result = await executor.query(
    `
      SELECT COUNT(*)::INT AS total
      FROM narrative_logs
      WHERE user_id = $1
        AND detected_emotional_state = $2
        AND logged_at >= NOW() - ($3::TEXT || ' days')::INTERVAL
    `,
    [userId, detectedEmotionalState, String(days)]
  );

  return result.rows[0]?.total || 0;
}

async function getSupportActivityByKey(activityKey) {
  const result = await query(
    `
      SELECT
        activity_id AS "activityId",
        activity_key AS "activityKey",
        activity_title AS "activityTitle",
        activity_type AS "activityType",
        target_emotion AS "targetEmotion",
        instruction_text AS "instructionText"
      FROM support_activities
      WHERE activity_key = $1
        AND is_active = TRUE
      LIMIT 1
    `,
    [activityKey]
  );

  return result.rows[0] || null;
}

async function createNarrativeInteraction({
  userId,
  promptId,
  transcribedNarrative,
  detectedEmotionalState,
  confidenceScore,
  riskLevel,
  supportActivityKey,
  caregiverNotificationRequired,
  supportDirective,
  alertPayload,
  detectionSource = 'rule_fallback',
  modelVersion = null,
}) {
  return withTransaction(async (client) => {
    const narrativeResult = await client.query(
      `
        INSERT INTO narrative_logs (
          user_id,
          prompt_id,
          transcribed_narrative,
          detected_emotional_state,
          confidence_score,
          risk_level,
          support_activity_key,
          caregiver_notification_required,
          support_directive,
          detection_source,
          model_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        RETURNING
          interaction_id AS "interactionId",
          detected_emotional_state AS "detectedEmotionalState",
          confidence_score::FLOAT AS "confidenceScore",
          detection_source AS "detectionSource",
          model_version AS "modelVersion",
          risk_level AS "riskLevel",
          support_activity_key AS "supportActivityKey",
          caregiver_notification_required AS "caregiverNotificationRequired",
          support_directive AS "supportDirective",
          logged_at AS "loggedAt"
      `,
      [
        userId,
        promptId,
        transcribedNarrative,
        detectedEmotionalState,
        confidenceScore,
        riskLevel,
        supportActivityKey,
        caregiverNotificationRequired,
        JSON.stringify(supportDirective),
        detectionSource,
        modelVersion,
      ]
    );

    let alert = null;

    if (alertPayload) {
      const alertResult = await client.query(
        `
          INSERT INTO emotional_caregiver_alerts (
            user_id,
            alert_type,
            alert_message,
            trigger_reason,
            severity
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING
            alert_id AS "alertId",
            alert_type AS "alertType",
            severity,
            created_at AS "createdAt"
        `,
        [
          userId,
          alertPayload.alertType,
          alertPayload.alertMessage,
          alertPayload.triggerReason,
          alertPayload.severity,
        ]
      );

      alert = alertResult.rows[0];
    }

    return {
      narrative: narrativeResult.rows[0],
      alert,
    };
  });
}

module.exports = {
  createNarrativeInteraction,
  getPromptById,
  getRecentConcernCount,
  getSupportActivityByKey,
};
