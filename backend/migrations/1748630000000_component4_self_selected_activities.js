/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_activity_attempts
      ALTER COLUMN adaptive_session_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS activity_source VARCHAR(30) NOT NULL DEFAULT 'recommended';
    ALTER TABLE adaptive_activity_attempts
      DROP CONSTRAINT IF EXISTS adaptive_activity_attempts_source_check,
      ADD CONSTRAINT adaptive_activity_attempts_source_check CHECK (
        (activity_source = 'recommended' AND adaptive_session_id IS NOT NULL)
        OR (activity_source = 'self_selected' AND adaptive_session_id IS NULL)
      );
    CREATE UNIQUE INDEX IF NOT EXISTS adaptive_activity_attempts_one_active_self_selected_idx
      ON adaptive_activity_attempts (user_id, activity_code)
      WHERE completed_at IS NULL AND activity_source = 'self_selected';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM adaptive_activity_attempts
    WHERE activity_source = 'self_selected' AND adaptive_session_id IS NULL;
    DROP INDEX IF EXISTS adaptive_activity_attempts_one_active_self_selected_idx;
    ALTER TABLE adaptive_activity_attempts
      DROP CONSTRAINT IF EXISTS adaptive_activity_attempts_source_check,
      DROP COLUMN IF EXISTS activity_source,
      ALTER COLUMN adaptive_session_id SET NOT NULL;
  `);
};
