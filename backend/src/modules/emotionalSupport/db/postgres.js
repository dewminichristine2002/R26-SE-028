const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool;

function resolveSsl() {
  if (process.env.DB_SSL === 'false') {
    return false;
  }

  if (process.env.DB_SSL === 'true' || (process.env.DB_HOST || '').includes('supabase.com')) {
    return { rejectUnauthorized: false };
  }

  return false;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: resolveSsl(),
    });
  }

  return pool;
}

async function query(text, params = []) {
  return getPool().query(text, params);
}

async function withTransaction(callback) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initializeSchema() {
  const schemaPath = path.join(__dirname, '..', 'models', 'emotionalSupportModel.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  return query(sql);
}

module.exports = {
  getPool,
  initializeSchema,
  query,
  withTransaction,
};
