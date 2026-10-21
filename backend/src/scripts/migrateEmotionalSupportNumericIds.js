require('dotenv').config();

const { getPool } = require('../db/postgres');

const UUID_TO_INT = {
  '11111111-1111-1111-1111-111111111111': 1,
  '33333333-3333-3333-3333-333333333333': 3,
  '44444444-4444-4444-4444-444444444444': 4,
  '22222222-2222-2222-2222-222222222222': 2,
};

const TABLE_COLUMNS = [
  ['emotional_support_activity_attempts', 'elder_user_id'],
  ['chat_logs', 'elder_user_id'],
  ['emotional_support_interventions', 'elder_user_id'],
  ['emotional_support_caregiver_alerts', 'elder_user_id'],
  ['emotional_support_caregiver_alerts', 'caregiver_user_id'],
  ['emotional_support_trend_snapshots', 'elder_user_id'],
  ['emotional_support_emotion_sessions', 'elder_user_id'],
  ['emotional_support_elder_profiles', 'elder_user_id'],
];

function uuidToIntCase(columnName) {
  const cases = Object.entries(UUID_TO_INT)
    .map(([uuid, id]) => `WHEN '${uuid}' THEN ${id}`)
    .join('\n          ');

  return `
    CASE ${columnName}::TEXT
      ${cases}
      WHEN '1' THEN 1
      WHEN '2' THEN 2
      WHEN '3' THEN 3
      WHEN '4' THEN 4
      ELSE NULL
    END
  `;
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName]
  );

  return result.rows[0] || null;
}

async function migrateColumn(client, tableName, columnName) {
  const column = await columnExists(client, tableName, columnName);
  if (!column || column.data_type === 'integer') {
    return false;
  }

  await client.query(
    `
      ALTER TABLE ${tableName}
      ALTER COLUMN ${columnName} TYPE INTEGER
      USING ${uuidToIntCase(columnName)}
    `
  );

  return true;
}

async function migrateCaregiverArray(client) {
  const column = await columnExists(client, 'emotional_support_elder_profiles', 'caregiver_user_ids');
  if (!column || column.data_type === 'ARRAY') {
    const typeResult = await client.query(`
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'emotional_support_elder_profiles'
        AND column_name = 'caregiver_user_ids'
    `);

    if (typeResult.rows[0]?.udt_name === '_int4') {
      return false;
    }
  }

  await client.query(`
    ALTER TABLE emotional_support_elder_profiles
    ALTER COLUMN caregiver_user_ids DROP DEFAULT
  `);

  await client.query(
    `
      ALTER TABLE emotional_support_elder_profiles
      ALTER COLUMN caregiver_user_ids TYPE INTEGER[]
      USING CASE
        WHEN caregiver_user_ids::TEXT LIKE '%22222222-2222-2222-2222-222222222222%' THEN ARRAY[2]::INTEGER[]
        WHEN caregiver_user_ids::TEXT = '{2}' THEN ARRAY[2]::INTEGER[]
        ELSE ARRAY[]::INTEGER[]
      END
    `
  );

  await client.query(`
    ALTER TABLE emotional_support_elder_profiles
    ALTER COLUMN caregiver_user_ids SET DEFAULT ARRAY[]::INTEGER[]
  `);

  return true;
}

async function main() {
  const pool = getPool();
  const client = await pool.connect();
  const migrated = [];

  try {
    await client.query('BEGIN');

    await migrateCaregiverArray(client);

    for (const [tableName, columnName] of TABLE_COLUMNS) {
      const changed = await migrateColumn(client, tableName, columnName);
      if (changed) {
        migrated.push(`${tableName}.${columnName}`);
      }
    }

    await client.query('COMMIT');

    console.log('Emotional support numeric ID migration completed.');
    console.log(JSON.stringify({ migrated }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to migrate emotional support numeric IDs.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
