const { query } = require('../db/postgres');

function mapTopic(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    topicType: row.topicType,
    topicLabel: row.topicLabel || null,
    safeDetail: row.safeDetail || null,
    sourceActivityId: row.sourceActivityId || null,
    consentStatus: Boolean(row.consentStatus),
    isActive: Boolean(row.isActive),
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
  };
}

const publicColumns = `
  id, user_id AS "userId", topic_type AS "topicType", topic_label AS "topicLabel",
  safe_detail AS "safeDetail", source_activity_id AS "sourceActivityId",
  consent_status AS "consentStatus", is_active AS "isActive",
  last_used_at AS "lastUsedAt", created_at AS "createdAt"
`;

async function listActiveTopics(userId) {
  const result = await query(
    `SELECT ${publicColumns}
     FROM reminiscence_user_topics
     WHERE user_id = $1 AND is_active = TRUE AND consent_status = TRUE
     ORDER BY last_used_at NULLS FIRST, created_at ASC`,
    [userId]
  );
  return result.rows.map(mapTopic);
}

async function createTopic({ userId, topicType, topicLabel = null, safeDetail = null, sourceActivityId = null }) {
  // Consent is mandatory: rows are only ever written with an explicit
  // consent signal recorded at creation time.
  const result = await query(
    `INSERT INTO reminiscence_user_topics (
       user_id, topic_type, topic_label, safe_detail, source_activity_id,
       consent_status, consent_recorded_at
     )
     VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
     RETURNING ${publicColumns}`,
    [userId, String(topicType).trim().toLowerCase(), topicLabel, safeDetail, sourceActivityId]
  );
  return mapTopic(result.rows[0]);
}

async function deactivateTopic(topicId, userId) {
  const result = await query(
    `UPDATE reminiscence_user_topics
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_active = TRUE
     RETURNING ${publicColumns}`,
    [topicId, userId]
  );
  return mapTopic(result.rows[0]);
}

async function deactivateAllTopics(userId) {
  const result = await query(
    `UPDATE reminiscence_user_topics
     SET is_active = FALSE, updated_at = NOW()
     WHERE user_id = $1 AND is_active = TRUE
     RETURNING ${publicColumns}`,
    [userId]
  );
  return result.rows.map(mapTopic);
}

/**
 * Select the next prompt topic deterministically:
 * prefer the least-recently-used active consented topic (never-used first),
 * tie-broken by creation order. Avoids repeating the same topic every session.
 */
async function selectNextPromptTopic(userId) {
  const result = await query(
    `SELECT ${publicColumns}
     FROM reminiscence_user_topics
     WHERE user_id = $1 AND is_active = TRUE AND consent_status = TRUE
     ORDER BY last_used_at NULLS FIRST, created_at ASC, id ASC
     LIMIT 1`,
    [userId]
  );
  return mapTopic(result.rows[0]);
}

async function markTopicUsed(topicId) {
  const result = await query(
    `UPDATE reminiscence_user_topics
     SET last_used_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING ${publicColumns}`,
    [topicId]
  );
  return mapTopic(result.rows[0]);
}

module.exports = {
  createTopic,
  deactivateAllTopics,
  deactivateTopic,
  listActiveTopics,
  markTopicUsed,
  selectNextPromptTopic,
};