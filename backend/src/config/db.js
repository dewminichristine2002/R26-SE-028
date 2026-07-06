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

  if (String(process.env.DB_SYNC_SCHEMA || '').toLowerCase() === 'true') {
    console.warn(
      '[DB] DB_SYNC_SCHEMA is deprecated. Use `npm run db:migrate` to manage schema changes.'
    );
  }
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
