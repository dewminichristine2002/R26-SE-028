/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    DELETE FROM emotional_caregiver_alerts
    WHERE pg_typeof(user_id)::TEXT = 'uuid'
      AND user_id::TEXT !~ '^00000000-0000-0000-0000-000000[0-9]{6}$';

    DELETE FROM narrative_logs
    WHERE pg_typeof(user_id)::TEXT = 'uuid'
      AND user_id::TEXT !~ '^00000000-0000-0000-0000-000000[0-9]{6}$';

    DELETE FROM mood_checkins
    WHERE pg_typeof(user_id)::TEXT = 'uuid'
      AND user_id::TEXT !~ '^00000000-0000-0000-0000-000000[0-9]{6}$';
  `);

  pgm.sql(`
    ALTER TABLE mood_checkins
      ALTER COLUMN user_id TYPE integer USING RIGHT(user_id::TEXT, 6)::integer;

    ALTER TABLE narrative_logs
      ALTER COLUMN user_id TYPE integer USING RIGHT(user_id::TEXT, 6)::integer;

    ALTER TABLE emotional_caregiver_alerts
      ALTER COLUMN user_id TYPE integer USING RIGHT(user_id::TEXT, 6)::integer;
  `);

  pgm.sql(`
    ALTER TABLE mood_checkins
      DROP CONSTRAINT IF EXISTS mood_checkins_user_id_fkey;

    ALTER TABLE narrative_logs
      DROP CONSTRAINT IF EXISTS narrative_logs_user_id_fkey;

    ALTER TABLE emotional_caregiver_alerts
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_user_id_fkey;

    ALTER TABLE mood_checkins
      ADD CONSTRAINT mood_checkins_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;

    ALTER TABLE narrative_logs
      ADD CONSTRAINT narrative_logs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;

    ALTER TABLE emotional_caregiver_alerts
      ADD CONSTRAINT emotional_caregiver_alerts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE emotional_caregiver_alerts
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_user_id_fkey;

    ALTER TABLE narrative_logs
      DROP CONSTRAINT IF EXISTS narrative_logs_user_id_fkey;

    ALTER TABLE mood_checkins
      DROP CONSTRAINT IF EXISTS mood_checkins_user_id_fkey;
  `);

  pgm.sql(`
    ALTER TABLE mood_checkins
      ALTER COLUMN user_id TYPE uuid USING (
        '00000000-0000-0000-0000-' || LPAD(user_id::TEXT, 12, '0')
      )::uuid;

    ALTER TABLE narrative_logs
      ALTER COLUMN user_id TYPE uuid USING (
        '00000000-0000-0000-0000-' || LPAD(user_id::TEXT, 12, '0')
      )::uuid;

    ALTER TABLE emotional_caregiver_alerts
      ALTER COLUMN user_id TYPE uuid USING (
        '00000000-0000-0000-0000-' || LPAD(user_id::TEXT, 12, '0')
      )::uuid;
  `);
};
