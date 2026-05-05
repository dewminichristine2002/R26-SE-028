const { query, withTransaction } = require('../db/postgres');

function buildUserMessage({ inputMode, emoji, text, transcript }) {
  const mergedText = [text, transcript].filter(Boolean).join(' ').trim();

  if (mergedText) {
    return mergedText;
  }

  if (inputMode === 'emoji' && emoji) {
    return `Mood selected: ${emoji}`;
  }

  return emoji || 'Check-in submitted';
}

function mapLogMessageType(inputMode) {
  if (inputMode === 'voice') {
    return 'voice_transcript';
  }

  if (inputMode === 'emoji') {
    return 'emoji';
  }

  if (inputMode === 'multimodal') {
    return 'multimodal';
  }

  return 'text';
}

async function getNegativeMoodCount(elderId, days = 7) {
  const result = await query(
    `
      SELECT COUNT(*)::INT AS total
      FROM emotional_support_emotion_sessions
      WHERE elder_user_id = $1
        AND detected_emotion IN ('sad', 'lonely', 'anxious', 'confused', 'angry')
        AND created_at >= NOW() - ($2::TEXT || ' days')::INTERVAL
    `,
    [elderId, String(days)]
  );

  return result.rows[0]?.total || 0;
}

async function createCheckInRecord({
  elderId,
  inputMode,
  checkInType,
  emoji,
  text,
  transcript,
  audioUrl,
  analysis,
  riskLevel,
  contextSnapshot,
  intervention,
  activity,
}) {
  return withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        INSERT INTO emotional_support_emotion_sessions (
          elder_user_id,
          input_mode,
          check_in_type,
          emoji,
          raw_text,
          transcript,
          audio_url,
          sentiment_score,
          stress_score,
          loneliness_score,
          confidence_score,
          detected_emotion,
          emotion_probabilities,
          context_snapshot,
          risk_level
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15)
        RETURNING
          id,
          elder_user_id AS "elderId",
          input_mode AS "inputMode",
          check_in_type AS "checkInType",
          detected_emotion AS "detectedEmotion",
          risk_level AS "riskLevel",
          created_at AS "createdAt"
      `,
      [
        elderId,
        inputMode,
        checkInType,
        emoji || null,
        text || null,
        transcript || null,
        audioUrl || null,
        analysis.sentimentScore,
        analysis.stressScore,
        analysis.lonelinessScore,
        analysis.confidence,
        analysis.detectedEmotion,
        JSON.stringify(analysis.emotionProbabilities),
        JSON.stringify(contextSnapshot || {}),
        riskLevel,
      ]
    );

    const session = sessionResult.rows[0];

    const interventionResult = await client.query(
      `
        INSERT INTO emotional_support_interventions (
          session_id,
          elder_user_id,
          response_bank_id,
          response_type,
          response_text,
          response_source,
          trigger_emotion,
          trigger_risk_level,
          selected_because,
          follow_up_prompt
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        RETURNING
          id,
          response_bank_id AS "responseBankId",
          response_type AS "responseType",
          response_text AS "responseText",
          response_source AS "responseSource",
          follow_up_prompt AS "followUpPrompt"
      `,
      [
        session.id,
        elderId,
        intervention.responseBankId || null,
        intervention.responseType,
        intervention.responseText,
        intervention.responseSource,
        intervention.reasoning.triggerEmotion,
        intervention.reasoning.triggerRiskLevel,
        JSON.stringify(intervention.reasoning.selectedBecause || []),
        intervention.followUpPrompt || null,
      ]
    );

    const storedIntervention = interventionResult.rows[0];

    await client.query(
      `
        INSERT INTO chat_logs (
          session_id,
          elder_user_id,
          actor_type,
          message_type,
          message_text,
          detected_emotion,
          metadata
        )
        VALUES ($1, $2, 'elder', $3, $4, $5, $6::jsonb)
      `,
      [
        session.id,
        elderId,
        mapLogMessageType(inputMode),
        buildUserMessage({ inputMode, emoji, text, transcript }),
        analysis.detectedEmotion,
        JSON.stringify({
          checkInType,
          emoji: emoji || null,
          rawText: text || null,
          transcript: transcript || null,
          audioUrl: audioUrl || null,
        }),
      ]
    );

    await client.query(
      `
        INSERT INTO chat_logs (
          session_id,
          elder_user_id,
          actor_type,
          message_type,
          message_text,
          detected_emotion,
          response_bank_id,
          intervention_id,
          metadata
        )
        VALUES ($1, $2, 'system', 'response', $3, $4, $5, $6, $7::jsonb)
      `,
      [
        session.id,
        elderId,
        storedIntervention.responseText,
        analysis.detectedEmotion,
        storedIntervention.responseBankId || null,
        storedIntervention.id,
        JSON.stringify({
          responseType: storedIntervention.responseType,
          responseSource: storedIntervention.responseSource,
          followUpPrompt: storedIntervention.followUpPrompt || null,
        }),
      ]
    );

    await client.query(
      `
        UPDATE emotional_support_emotion_sessions
        SET
          intervention_id = $2,
          activity_id = $3,
          updated_at = NOW()
        WHERE id = $1
      `,
      [session.id, storedIntervention.id, activity?.id || null]
    );

    return {
      session: {
        ...session,
        interventionId: storedIntervention.id,
        activityId: activity?.id || null,
      },
      intervention: storedIntervention,
    };
  });
}

async function getHistory(elderId, limit = 20) {
  const result = await query(
    `
      SELECT
        id AS "sessionId",
        input_mode AS "inputMode",
        check_in_type AS "checkInType",
        emoji,
        raw_text AS "rawText",
        transcript,
        detected_emotion AS "detectedEmotion",
        risk_level AS "riskLevel",
        sentiment_score::FLOAT AS "sentimentScore",
        stress_score::FLOAT AS "stressScore",
        loneliness_score::FLOAT AS "lonelinessScore",
        confidence_score::FLOAT AS "confidence",
        created_at AS "createdAt"
      FROM emotional_support_emotion_sessions
      WHERE elder_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [elderId, limit]
  );

  return result.rows;
}

async function getChatLogs(sessionId) {
  const result = await query(
    `
      SELECT
        id,
        session_id AS "sessionId",
        elder_user_id AS "elderId",
        actor_type AS "actorType",
        message_type AS "messageType",
        message_text AS "messageText",
        detected_emotion AS "detectedEmotion",
        response_bank_id AS "responseBankId",
        intervention_id AS "interventionId",
        metadata,
        created_at AS "createdAt"
      FROM chat_logs
      WHERE session_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [sessionId]
  );

  return result.rows;
}

async function getTrendSummary(elderId) {
  const result = await query(
    `
      WITH recent_sessions AS (
        SELECT
          detected_emotion,
          stress_score::FLOAT AS stress_score,
          loneliness_score::FLOAT AS loneliness_score,
          CASE
            WHEN detected_emotion IN ('sad', 'lonely', 'anxious', 'confused', 'angry') THEN 1
            ELSE 0
          END AS is_negative
        FROM emotional_support_emotion_sessions
        WHERE elder_user_id = $1
          AND created_at >= NOW() - INTERVAL '7 days'
      ),
      emotion_counts AS (
        SELECT detected_emotion, COUNT(*)::INT AS total
        FROM recent_sessions
        GROUP BY detected_emotion
      ),
      dominant_emotion AS (
        SELECT detected_emotion
        FROM emotion_counts
        ORDER BY total DESC, detected_emotion ASC
        LIMIT 1
      )
      SELECT
        COALESCE((SELECT detected_emotion FROM dominant_emotion), 'neutral') AS "dominantEmotion7d",
        COALESCE((SELECT SUM(is_negative) FROM recent_sessions), 0)::INT AS "negativeMoodCount7d",
        COALESCE((SELECT AVG(stress_score) FROM recent_sessions), 0)::FLOAT AS "averageStressScore7d",
        COALESCE((SELECT AVG(loneliness_score) FROM recent_sessions), 0)::FLOAT AS "averageLonelinessScore7d",
        (
          SELECT COUNT(*)::INT
          FROM emotional_support_caregiver_alerts
          WHERE elder_user_id = $1
            AND status = 'open'
        ) AS "openAlerts"
    `,
    [elderId]
  );

  return {
    elderId,
    ...result.rows[0],
  };
}

module.exports = {
  createCheckInRecord,
  getChatLogs,
  getHistory,
  getNegativeMoodCount,
  getTrendSummary,
};
