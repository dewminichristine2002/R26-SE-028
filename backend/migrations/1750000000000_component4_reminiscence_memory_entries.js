/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Generalized reminiscence memory entries for Life Book and Good Deeds.
    CREATE TABLE IF NOT EXISTS reminiscence_memory_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
      entry_type VARCHAR(50) NOT NULL,
      title VARCHAR(200) NOT NULL,
      category VARCHAR(80),
      story TEXT,
      memory_date DATE,
      photo_reference VARCHAR(255),
      consent_status BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS reminiscence_memory_entries_user_idx
      ON reminiscence_memory_entries (user_id, entry_type, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS reminiscence_memory_entries_user_idx;
    DROP TABLE IF EXISTS reminiscence_memory_entries;
  `);
};
