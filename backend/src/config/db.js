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
