const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
};

if (!dbConfig.password) {
  console.warn('DB_PASSWORD is not set. Database-backed features will not work until configured.');
}

const pool = new Pool(dbConfig);

const initializeDatabase = async () => {
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

  await pool.query(createTableQuery);
  await pool.query(createUsersTableQuery);
  await pool.query(createUserRoutinesTableQuery);

  const backfillUserRoutines = `
    INSERT INTO user_routines (user_id)
    SELECT id
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  `;

  await pool.query(backfillUserRoutines);
};

module.exports = {
  pool,
  initializeDatabase,
};
