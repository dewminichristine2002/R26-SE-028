const { query } = require('../db/postgres');

async function createMoodCheckin({
  userId,
  moodLabel,
  moodScore,
  reflectionText,
  inputMode,
}) {
  const result = await query(
    `
      INSERT INTO mood_checkins (
        user_id,
        mood_label,
        mood_score,
        reflection_text,
        input_mode
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        checkin_id,
        user_id,
        mood_label,
        mood_score,
        reflection_text,
        input_mode,
        logged_at
    `,
    [
      userId,
      moodLabel,
      moodScore,
      reflectionText || null,
      inputMode || 'manual',
    ]
  );

  return result.rows[0];
}

module.exports = {
  createMoodCheckin,
};
