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
      total_quantity INTEGER NOT NULL,
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
      schedule_slot TEXT,
      dose_number INTEGER,
      times_per_day INTEGER,
      routine_time TEXT,
      reminder_time TIMESTAMPTZ,
      event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  await pool.query(createUsersTableQuery);
  await pool.query(createUserRoutinesTableQuery);
  await pool.query(createMedicinesTableQuery);
  await pool.query(createUserMedicationsTableQuery);
  await pool.query(createMedicationStatusEventsTableQuery);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_color TEXT;`);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_shape TEXT;`);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS event_time TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
  await pool.query(`ALTER TABLE medication_status_events ADD COLUMN IF NOT EXISTS overdose_tablets NUMERIC(6,2);`);
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

};

module.exports = {
  pool,
  initializeDatabase,
};
