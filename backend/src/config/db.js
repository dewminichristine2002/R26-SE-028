const { Pool } = require('pg');
const { URL } = require('url');

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

const getConnectionStringHost = (connectionString) => {
  if (!connectionString) {
    return '';
  }

  try {
    return new URL(connectionString).hostname || '';
  } catch {
    return '';
  }
};

const resolvedConnectionHost = getConnectionStringHost(resolvedDatabaseUrl);
const sslHost = resolvedDatabaseUrl ? (resolvedConnectionHost || resolvedHost) : resolvedHost;
const isSupabasePooler = /\.pooler\.supabase\.com$/i.test(resolvedDatabaseUrl ? sslHost : resolvedHost);

const poolOptions = {
  connectionTimeoutMillis: resolvedConnectionTimeout,
  query_timeout: Number(process.env.DB_QUERY_TIMEOUT_MS || 8000),
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 8000),
  keepAlive: true,
  max: Number(process.env.DB_POOL_MAX || (isSupabasePooler ? 5 : 10)),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || (isSupabasePooler ? 30000 : 10000)),
  ...(resolvedFamily ? { family: resolvedFamily } : {}),
};

const dbConfig = resolvedDatabaseUrl
  ? {
      connectionString: resolvedDatabaseUrl,
      ...poolOptions,
      ssl: getSslConfig(sslHost),
    }
  : {
      host: resolvedHost,
      port: resolvedPort,
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ...poolOptions,
      ssl: getSslConfig(resolvedHost),
    };

const buildConfigWithPortOverride = (portOverride) => {
  if (resolvedDatabaseUrl) {
    const parsed = new URL(resolvedDatabaseUrl);
    parsed.port = String(portOverride);
    return {
      connectionString: parsed.toString(),
      ...poolOptions,
      ssl: getSslConfig(parsed.hostname || sslHost),
    };
  }

  return {
    ...dbConfig,
    port: portOverride,
    ssl: getSslConfig(resolvedHost),
  };
};

const parseConnectionStringIdentity = (connectionString) => {
  if (!connectionString) {
    return null;
  }

  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname || resolvedHost,
      port: Number(parsed.port || resolvedPort),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') || 'postgres' : 'postgres',
      user: decodeURIComponent(parsed.username || 'postgres'),
      usesConnectionString: true,
    };
  } catch {
    return null;
  }
};

const getResolvedDatabaseIdentity = () => {
  const parsedIdentity = parseConnectionStringIdentity(resolvedDatabaseUrl);
  if (parsedIdentity) {
    return parsedIdentity;
  }

  return {
    host: dbConfig.host || resolvedHost,
    port: dbConfig.port || resolvedPort,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    usesConnectionString: Boolean(resolvedDatabaseUrl),
  };
};

const getDatabaseTroubleshootingHints = (errorMessage = '') => {
  const { host, port } = getResolvedDatabaseIdentity();
  const hints = [];
  const normalizedError = String(errorMessage).toLowerCase();
  const isSupabasePooler = /\.pooler\.supabase\.com$/i.test(host);

  if (normalizedError.includes('timeout')) {
    hints.push('The TCP socket opens, but PostgreSQL never completes the startup handshake from this machine.');
  }

  if (normalizedError.includes('tenant/user') && normalizedError.includes('not found')) {
    hints.push(
      'Supabase returned "tenant/user not found". The project is usually paused, deleted, or the DB_USER project ref is wrong. Open the Supabase dashboard, restore the project if paused, then copy a fresh connection string from Settings → Database → Connect.'
    );
  }

  if (normalizedError.includes('enotfound') && /db\.[^.]+\.supabase\.co/i.test(host)) {
    hints.push(
      'The direct database hostname did not resolve. Confirm the project still exists and the project reference in DB_HOST/DATABASE_URL matches the Supabase dashboard.'
    );
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

if (!dbConfig.password) {
  console.warn('DB_PASSWORD is not set. Database-backed features will not work until configured.');
}

let livePool = new Pool(dbConfig);
const dbState = {
  connected: false,
  lastError: null,
  lastAttemptAt: null,
  activePort: resolvedPort,
};

const attachPoolListeners = (targetPool) => {
  targetPool.on('error', (error) => {
    const message = String(error?.message || error);
    const normalized = message.toLowerCase();
    const isIdleDisconnect =
      normalized.includes('administrator command') ||
      normalized.includes('connection terminated') ||
      normalized.includes('ECONNRESET'.toLowerCase());

    if (isIdleDisconnect) {
      console.warn('[DB] Idle pool connection closed by server; pool will reconnect on next query.');
      return;
    }

    console.error('[DB] Unexpected pool error:', message);
    dbState.connected = false;
    dbState.lastError = message;
  });
};

attachPoolListeners(livePool);

// Keep a stable exported object so route modules do not retain a stale Pool
// instance when we switch from Supabase pooler port 6543 to session port 5432.
const pool = {
  query: (...args) => livePool.query(...args),
  connect: (...args) => livePool.connect(...args),
  end: (...args) => livePool.end(...args),
  on: (...args) => livePool.on(...args),
};

const shouldRetryWithSupabaseSessionPort = (errorMessage = '') => {
  if (!isSupabasePooler || String(dbState.activePort) !== '6543') {
    return false;
  }

  const message = String(errorMessage);
  const normalized = message.toLowerCase();
  return normalized.includes('timeout') || normalized.includes('connection terminated');
};

const switchPoolToPort = (portOverride) => {
  const nextConfig = buildConfigWithPortOverride(portOverride);
  livePool.end().catch(() => {});
  livePool = new Pool(nextConfig);
  attachPoolListeners(livePool);
  dbState.activePort = portOverride;
};

const initializeDatabase = async () => {
  const identity = getResolvedDatabaseIdentity();
  dbState.lastAttemptAt = new Date().toISOString();
  console.log(`[DB] Connecting to ${identity.host}:${identity.port}/${identity.database} as ${identity.user}`);

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
      caregiver_email TEXT,
      caregiver_phone TEXT,
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

  const createMedicinesTableQuery = `
    CREATE TABLE IF NOT EXISTS medicines (
      id SERIAL PRIMARY KEY,
      "medicineName" TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createUserMedicationsTableQuery = `
    CREATE TABLE IF NOT EXISTS user_medications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medicine_name TEXT NOT NULL,
      selected_color TEXT,
      selected_shape TEXT,
      total_quantity NUMERIC(10,2) NOT NULL,
      dosage_mg INTEGER NOT NULL,
      daily_amount INTEGER NOT NULL,
      dose_form TEXT NOT NULL,
      take_with TEXT NOT NULL,
      intake_timing TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createMedicationStatusEventsTableQuery = `
    CREATE TABLE IF NOT EXISTS medication_status_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medication_id INTEGER NOT NULL REFERENCES user_medications(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('taken', 'remind', 'overdose', 'speak', 'not-taken')),
      overdose_tablets NUMERIC(6,2) CHECK (overdose_tablets IS NULL OR overdose_tablets > 0),
      quantity_used NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (quantity_used >= 0),
      schedule_slot TEXT,
      dose_number INTEGER,
      times_per_day INTEGER,
      routine_time TEXT,
      reminder_time TIMESTAMPTZ,
      event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createMedicationStockTableQuery = `
    CREATE TABLE IF NOT EXISTS medication_stock (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medication_id INTEGER UNIQUE NOT NULL REFERENCES user_medications(id) ON DELETE CASCADE,
      initial_quantity NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (initial_quantity >= 0),
      current_quantity NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const createCaregiverAlertsTableQuery = `
    CREATE TABLE IF NOT EXISTS caregiver_alerts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status_event_id INTEGER REFERENCES medication_status_events(id) ON DELETE SET NULL,
      medication_id INTEGER REFERENCES user_medications(id) ON DELETE SET NULL,
      caregiver_email TEXT,
      caregiver_phone TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );
  `;

  try {
    try {
      await pool.query('SELECT 1');
    } catch (connectionError) {
      if (shouldRetryWithSupabaseSessionPort(connectionError?.message || '')) {
        console.warn('[DB] Port 6543 handshake timed out. Retrying with Supabase session mode on port 5432...');
        switchPoolToPort(5432);
        await pool.query('SELECT 1');
      } else {
        throw connectionError;
      }
    }

    await pool.query(createTableQuery);
    await pool.query(createUsersTableQuery);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS caregiver_email TEXT;`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS caregiver_phone TEXT;`);
    await pool.query(`CREATE INDEX IF NOT EXISTS users_caregiver_email_idx ON users (caregiver_email);`);
    await pool.query(createUserRoutinesTableQuery);
    await pool.query(createMedicinesTableQuery);
    await pool.query(createUserMedicationsTableQuery);
    await pool.query(createMedicationStockTableQuery);
    await pool.query(`ALTER TABLE medication_stock ADD COLUMN IF NOT EXISTS initial_quantity NUMERIC(10,2) NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE medication_stock ADD COLUMN IF NOT EXISTS current_quantity NUMERIC(10,2) NOT NULL DEFAULT 0;`);
    await pool.query(`ALTER TABLE medication_stock ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await pool.query(`ALTER TABLE medication_stock ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS medication_stock_medication_id_idx ON medication_stock (medication_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS medication_stock_user_id_idx ON medication_stock (user_id);`);
    await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(10,2);`);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'user_medications'
            AND column_name = 'total_quantity'
            AND data_type <> 'numeric'
        ) THEN
          ALTER TABLE user_medications
          ALTER COLUMN total_quantity TYPE NUMERIC(10,2)
          USING total_quantity::NUMERIC(10,2);
        END IF;
      END $$;
    `);
    await pool.query(createMedicationStatusEventsTableQuery);
    await pool.query(createCaregiverAlertsTableQuery);
    await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_color TEXT;`);
    await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_shape TEXT;`);
    await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
    await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS overdose_tablets NUMERIC(6,2);`);
    await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS quantity_used NUMERIC(10,2) NOT NULL DEFAULT 0;`);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'medication_status_events'
            AND column_name = 'quantity_used'
            AND data_type <> 'numeric'
        ) THEN
          ALTER TABLE medication_status_events
          ALTER COLUMN quantity_used TYPE NUMERIC(10,2)
          USING quantity_used::NUMERIC(10,2);
        END IF;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'medication_status_events'
            AND column_name = 'overdose_tablets'
            AND data_type <> 'numeric'
        ) THEN
          ALTER TABLE medication_status_events
          ALTER COLUMN overdose_tablets TYPE NUMERIC(6,2)
          USING overdose_tablets::NUMERIC(6,2);
        END IF;
      END $$;
    `);
    await pool.query(`
      ALTER TABLE medication_status_events
      DROP CONSTRAINT IF EXISTS medication_status_events_overdose_tablets_check;
    `);
    await pool.query(`
      ALTER TABLE medication_status_events
      ADD CONSTRAINT medication_status_events_overdose_tablets_check
      CHECK (overdose_tablets IS NULL OR overdose_tablets > 0);
    `);
    await pool.query(`
      ALTER TABLE medication_status_events
      DROP CONSTRAINT IF EXISTS medication_status_events_quantity_used_check;
    `);
    await pool.query(`
      ALTER TABLE medication_status_events
      ADD CONSTRAINT medication_status_events_quantity_used_check
      CHECK (quantity_used >= 0);
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'medication_status_events'::regclass
            AND conname = 'medication_status_events_status_check'
        ) THEN
          ALTER TABLE medication_status_events DROP CONSTRAINT medication_status_events_status_check;
        END IF;

        ALTER TABLE medication_status_events
        ADD CONSTRAINT medication_status_events_status_check
        CHECK (status IN ('taken', 'remind', 'overdose', 'speak', 'not-taken'));
      END $$;
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS medication_status_events_user_id_idx ON medication_status_events (user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS medication_status_events_medication_id_idx ON medication_status_events (medication_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS medication_status_events_event_time_idx ON medication_status_events (event_time DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS caregiver_alerts_user_id_idx ON caregiver_alerts (user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS caregiver_alerts_unread_idx ON caregiver_alerts (user_id, is_read);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS caregiver_alerts_created_at_idx ON caregiver_alerts (created_at DESC);`);

    await pool.query(`
      INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
      SELECT um.user_id, um.id, GREATEST(0::numeric, um.total_quantity::numeric), GREATEST(0::numeric, um.total_quantity::numeric)
      FROM user_medications um
      ON CONFLICT (medication_id) DO NOTHING;
    `);

    // Keep compatibility with older schemas and ensure medicineName exists.
    await pool.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS "medicineName" TEXT;`);
    await pool.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS name TEXT;`);
    await pool.query(`ALTER TABLE medicines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);

    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'medicines' AND column_name = 'name'
        ) THEN
          EXECUTE 'UPDATE medicines SET "medicineName" = name WHERE "medicineName" IS NULL AND name IS NOT NULL';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'medicines' AND column_name = 'medicine_name'
        ) THEN
          EXECUTE 'UPDATE medicines SET "medicineName" = medicine_name WHERE "medicineName" IS NULL AND medicine_name IS NOT NULL';
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'medicines' AND column_name = 'medicinename'
        ) THEN
          EXECUTE 'UPDATE medicines SET "medicineName" = medicinename WHERE "medicineName" IS NULL AND medicinename IS NOT NULL';
        END IF;
      END $$;
    `);

    await pool.query(`
      UPDATE medicines
      SET "medicineName" = CONCAT('Medicine ', id)
      WHERE "medicineName" IS NULL OR BTRIM("medicineName") = '';
    `);

    await pool.query(`DROP INDEX IF EXISTS medicines_name_unique_idx;`);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS medicines_name_idx ON medicines ("medicineName");
    `);

    const backfillUserRoutines = `
      INSERT INTO user_routines (user_id)
      SELECT id
      FROM users
      ON CONFLICT (user_id) DO NOTHING;
    `;

    await pool.query(backfillUserRoutines);

    dbState.connected = true;
    dbState.lastError = null;
    console.log('[DB] Database initialization complete');
  } catch (error) {
    const message = error?.message || error?.code || String(error);
    dbState.connected = false;
    dbState.lastError = message;
    throw error;
  }

};

const getDatabaseStatus = () => ({
  connected: dbState.connected,
  lastAttemptAt: dbState.lastAttemptAt,
  lastError: dbState.lastError,
  host: dbConfig.host || resolvedHost,
  port: dbState.activePort || dbConfig.port || resolvedPort,
  database: dbConfig.database || process.env.DB_NAME || '',
  user: dbConfig.user || process.env.DB_USER || '',
  usesConnectionString: Boolean(resolvedDatabaseUrl),
});

const getPublicDatabaseStatus = () => ({
  connected: dbState.connected,
  lastAttemptAt: dbState.lastAttemptAt,
  lastError: dbState.lastError ? 'Database connection failed.' : null,
});

module.exports = {
  pool,
  initializeDatabase,
  getDatabaseStatus,
  getPublicDatabaseStatus,
  getDatabaseTroubleshootingHints,
  dbState,
};
