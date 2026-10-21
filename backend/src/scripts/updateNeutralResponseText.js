const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { getPool, query } = require('../db/postgres');

const previousText = 'Thank you for checking in. Let us keep the day steady with one small mental activity.';
const nextText =
  'Thank you for telling me. A quiet or ordinary day is still worth checking in about. Let us do one simple activity together.';
const nextFollowUp = 'Would you like to do a quick orientation check?';

async function main() {
  try {
    const result = await query(
      `
        UPDATE emotional_support_response_bank
        SET response_text = $1,
            follow_up_prompt = $2,
            updated_at = NOW()
        WHERE emotion_category = 'neutral'
          AND response_text = $3
        RETURNING id, emotion_category, response_text
      `,
      [nextText, nextFollowUp, previousText]
    );

    console.log(JSON.stringify({ updatedRows: result.rowCount, rows: result.rows }, null, 2));
  } catch (error) {
    console.error('Failed to update neutral emotional-support response.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
