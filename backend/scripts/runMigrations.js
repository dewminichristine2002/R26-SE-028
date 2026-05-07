const { execSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config();

const direction = process.argv[2] || 'up';
const allowedDirections = new Set(['up', 'down']);

if (!allowedDirections.has(direction)) {
  console.error(`Invalid migration direction "${direction}". Use "up" or "down".`);
  process.exit(1);
}

const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'postgres';
  const user = process.env.DB_USER || 'postgres';
  const password = process.env.DB_PASSWORD || '';

  if (!password) {
    throw new Error('DB_PASSWORD (or DATABASE_URL) is required to run migrations.');
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

const databaseUrl = buildDatabaseUrl();
const command =
  `npx node-pg-migrate ${direction} ` +
  '--migrations-dir migrations ' +
  '--database-url-var DB_MIGRATIONS_URL ' +
  '--migration-filename-format timestamp';

try {
  execSync(command, {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DB_MIGRATIONS_URL: databaseUrl,
    },
  });
} catch (error) {
  console.error(`Migration command failed: ${error.message}`);
  process.exit(1);
}
