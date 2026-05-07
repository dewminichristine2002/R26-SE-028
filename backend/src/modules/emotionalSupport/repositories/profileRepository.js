const { query } = require('../db/postgres');

async function getProfileByElderId(elderId) {
  const result = await query(
    `
      SELECT
        id,
        elder_user_id AS "elderId",
        display_name AS "displayName",
        age,
        living_status AS "livingStatus",
        caregiver_user_ids AS "caregiverIds"
      FROM emotional_support_elder_profiles
      WHERE elder_user_id = $1
      LIMIT 1
    `,
    [elderId]
  );

  return result.rows[0] || null;
}

module.exports = {
  getProfileByElderId,
};
