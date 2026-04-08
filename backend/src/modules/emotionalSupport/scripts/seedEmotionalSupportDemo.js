require('dotenv').config();

const { query, getPool } = require('../db/postgres');

const DEMO_ELDER_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_CAREGIVER_ID = '22222222-2222-2222-2222-222222222222';

async function seed() {
  await query(
    `
      INSERT INTO emotional_support_elder_profiles (
        elder_user_id,
        display_name,
        age,
        gender,
        living_status,
        baseline_mood,
        cognitive_level,
        check_in_times,
        voice_enabled,
        chronic_conditions,
        clinical_notes,
        caregiver_user_ids,
        updated_at
      )
      VALUES (
        $1,
        'Nimal Perera',
        72,
        'male',
        'alone',
        'neutral',
        'medium',
        ARRAY['09:00', '18:00'],
        FALSE,
        ARRAY['hypertension'],
        'Demo elder profile for emotional support testing.',
        ARRAY[$2]::UUID[],
        NOW()
      )
      ON CONFLICT (elder_user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        living_status = EXCLUDED.living_status,
        baseline_mood = EXCLUDED.baseline_mood,
        cognitive_level = EXCLUDED.cognitive_level,
        check_in_times = EXCLUDED.check_in_times,
        voice_enabled = EXCLUDED.voice_enabled,
        chronic_conditions = EXCLUDED.chronic_conditions,
        clinical_notes = EXCLUDED.clinical_notes,
        caregiver_user_ids = EXCLUDED.caregiver_user_ids,
        updated_at = NOW()
    `,
    [DEMO_ELDER_ID, DEMO_CAREGIVER_ID]
  );

  return {
    elderId: DEMO_ELDER_ID,
    caregiverId: DEMO_CAREGIVER_ID,
  };
}

async function main() {
  try {
    const result = await seed();
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('Failed to seed emotional support demo data.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
