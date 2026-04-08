const { Pool } = require('pg');

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const getSslConfig = (host) => {
  if (parseBoolean(process.env.DB_SSL_DISABLED, false)) {
    return false;
  }

  if (parseBoolean(process.env.DB_SSL, !['localhost', '127.0.0.1'].includes(host))) {
    return {
      rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, false),
    };
  }

  return false;
};

const resolvedHost = process.env.DB_HOST || 'localhost';
const resolvedPort = Number(process.env.DB_PORT || 5432);
const resolvedConnectionTimeout = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 8000);
const hasExplicitDbFields = Boolean(
  process.env.DB_HOST ||
  process.env.DB_PORT ||
  process.env.DB_NAME ||
  process.env.DB_USER ||
  process.env.DB_PASSWORD
);
const resolvedDatabaseUrl = hasExplicitDbFields ? '' : process.env.DATABASE_URL;
const resolvedFamily = process.env.DB_FAMILY ? Number(process.env.DB_FAMILY) : undefined;

const dbConfig = resolvedDatabaseUrl
  ? {
      connectionString: resolvedDatabaseUrl,
      connectionTimeoutMillis: resolvedConnectionTimeout,
      query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 8000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 8000),
      ssl: getSslConfig(resolvedHost),
      keepAlive: true,
      max: Number(process.env.DB_POOL_MAX || 10),
      ...(resolvedFamily ? { family: resolvedFamily } : {}),
    }
  : {
      host: resolvedHost,
      port: resolvedPort,
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      connectionTimeoutMillis: resolvedConnectionTimeout,
      query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 8000),
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 8000),
      ssl: getSslConfig(resolvedHost),
      keepAlive: true,
      max: Number(process.env.DB_POOL_MAX || 10),
      ...(resolvedFamily ? { family: resolvedFamily } : {}),
    };

const getResolvedDatabaseIdentity = () => ({
  host: dbConfig.host || resolvedHost,
  port: dbConfig.port || resolvedPort,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  usesConnectionString: Boolean(resolvedDatabaseUrl),
});

const getDatabaseTroubleshootingHints = (errorMessage = '') => {
  const { host, port } = getResolvedDatabaseIdentity();
  const hints = [];
  const normalizedError = String(errorMessage).toLowerCase();
  const isSupabasePooler = /\.pooler\.supabase\.com$/i.test(host);

  if (normalizedError.includes('timeout')) {
    hints.push('The TCP socket opens, but PostgreSQL never completes the startup handshake from this machine.');
  }

  if (isSupabasePooler && String(port) === '6543') {
    hints.push(
      'This backend is using the Supabase transaction pooler on port 6543. For a long-running backend server, Supabase session mode on the same host at port 5432 is usually the better fit.'
    );
  }

  if (/supabase\.com$/i.test(host)) {
    hints.push(
      'If both 5432 and 6543 hang, verify the connection string from the Supabase project Connect page and test from a different network or VPN. This pattern usually points to an endpoint/network mismatch rather than an Express bug.'
    );
  }

  if (process.env.DATABASE_URL && hasExplicitDbFields) {
    hints.push(
      'Explicit DB_HOST/DB_PORT/DB_USER/DB_PASSWORD values are present, so DATABASE_URL is being ignored to avoid conflicts.'
    );
  }

  if (!process.env.DB_PASSWORD && !resolvedDatabaseUrl) {
    hints.push('DB_PASSWORD is not set.');
  }

  return hints;
};

if (!process.env.DB_PASSWORD && !resolvedDatabaseUrl) {
  console.warn('DB_PASSWORD is not set. Database-backed features will not work until configured.');
}

const pool = new Pool(dbConfig);
const dbState = {
  connected: false,
  lastError: null,
  lastAttemptAt: null,
};

const shouldSyncSchema = String(process.env.DB_SYNC_SCHEMA || '').toLowerCase() === 'true';

pool.on('error', (error) => {
  console.error('[DB] Unexpected pool error:', error.message);
});

const initializeDatabase = async () => {
  dbState.lastAttemptAt = new Date().toISOString();
  dbState.lastError = null;
  const { host, port, database, user } = getResolvedDatabaseIdentity();
  console.log(
    `[DB] Connecting to ${host}:${port}/${database} as ${user}`
  );

  await pool.query('SELECT 1');
  console.log('[DB] Connection established');
  dbState.connected = true;

  if (!shouldSyncSchema) {
    return;
  }

  console.log('[DB] DB_SYNC_SCHEMA=true, ensuring database tables exist');

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS routines (
      id SERIAL PRIMARY KEY,
      profile_key TEXT UNIQUE NOT NULL DEFAULT 'default',
      breakfast_time TEXT NOT NULL DEFAULT '08:00 AM',
      lunch_time TEXT NOT NULL DEFAULT '01:00 PM',
      dinner_time TEXT NOT NULL DEFAULT '07:00 PM',
      sleep_time TEXT NOT NULL DEFAULT '10:30 PM',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createUsersTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      date_of_birth DATE,
      blood_type TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createUserRoutinesTableQuery = `
    CREATE TABLE IF NOT EXISTS user_routines (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      breakfast_time TEXT NOT NULL DEFAULT '08:00 AM',
      lunch_time TEXT NOT NULL DEFAULT '01:00 PM',
      dinner_time TEXT NOT NULL DEFAULT '07:00 PM',
      sleep_time TEXT NOT NULL DEFAULT '10:30 PM',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createUserAllergyProfilesTableQuery = `
    CREATE TABLE IF NOT EXISTS user_allergy_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      age TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      has_medicine_allergy BOOLEAN,
      known_allergies_text TEXT NOT NULL DEFAULT '',
      chronic_diseases_text TEXT NOT NULL DEFAULT '',
      current_medications_text TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      caregiver_details TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createAllergyQuestionnaireAnswersTableQuery = `
    CREATE TABLE IF NOT EXISTS allergy_questionnaire_answers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_key TEXT NOT NULL,
      answer_text TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, question_key)
    );
  `;

  const createAllergyCardsTableQuery = `
    CREATE TABLE IF NOT EXISTS allergy_cards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      medicine_name TEXT NOT NULL DEFAULT '',
      normalized_drug_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      risk_score INTEGER,
      risk_level TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      recommendation TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createAllergyCardRiskFactorsTableQuery = `
    CREATE TABLE IF NOT EXISTS allergy_card_risk_factors (
      id SERIAL PRIMARY KEY,
      allergy_card_id INTEGER NOT NULL REFERENCES allergy_cards(id) ON DELETE CASCADE,
      factor_type TEXT NOT NULL DEFAULT '',
      factor_label TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createMedicineCheckHistoryTableQuery = `
    CREATE TABLE IF NOT EXISTS medicine_check_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input_method TEXT NOT NULL DEFAULT '',
      raw_input TEXT NOT NULL DEFAULT '',
      medicine_name TEXT NOT NULL DEFAULT '',
      normalized_drug_name TEXT NOT NULL DEFAULT '',
      dose TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL DEFAULT '',
      risk_score INTEGER,
      risk_level TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createReactionLogsTableQuery = `
    CREATE TABLE IF NOT EXISTS reaction_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medicine_check_id INTEGER REFERENCES medicine_check_history(id) ON DELETE SET NULL,
      symptoms TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  await pool.query(createUsersTableQuery);
  await pool.query(createUserRoutinesTableQuery);
  await pool.query(createUserAllergyProfilesTableQuery);
  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS age TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT ''`);
  await pool.query(createAllergyQuestionnaireAnswersTableQuery);
  await pool.query(createAllergyCardsTableQuery);
  await pool.query(createAllergyCardRiskFactorsTableQuery);
  await pool.query(createMedicineCheckHistoryTableQuery);
  await pool.query(createReactionLogsTableQuery);

  const backfillUserRoutines = `
    INSERT INTO user_routines (user_id)
    SELECT id
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  `;

  await pool.query(backfillUserRoutines);

  const backfillUserAllergyProfiles = `
    INSERT INTO user_allergy_profiles (user_id)
    SELECT id
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  `;

  await pool.query(backfillUserAllergyProfiles);
};

const getDatabaseStatus = () => ({
  connected: dbState.connected,
  lastError: dbState.lastError,
  lastAttemptAt: dbState.lastAttemptAt,
  ...getResolvedDatabaseIdentity(),
});

module.exports = {
  pool,
  initializeDatabase,
  getDatabaseStatus,
  getDatabaseTroubleshootingHints,
  dbState,
};
