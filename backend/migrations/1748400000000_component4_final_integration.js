/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE emotional_caregiver_alerts
      VALIDATE CONSTRAINT emotional_caregiver_alerts_user_id_fkey;

    ALTER TABLE adaptive_activity_attempts
      ADD CONSTRAINT adaptive_activity_attempts_accuracy_check
        CHECK (accuracy_score IS NULL OR (accuracy_score >= 0 AND accuracy_score <= 1)),
      ADD CONSTRAINT adaptive_activity_attempts_response_time_check
        CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
      ADD CONSTRAINT adaptive_activity_attempts_completion_status_check
        CHECK (completion_status IN ('started', 'completed'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_activity_attempts
      DROP CONSTRAINT IF EXISTS adaptive_activity_attempts_completion_status_check,
      DROP CONSTRAINT IF EXISTS adaptive_activity_attempts_response_time_check,
      DROP CONSTRAINT IF EXISTS adaptive_activity_attempts_accuracy_check;
    ALTER TABLE emotional_caregiver_alerts
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_user_id_fkey,
      ADD CONSTRAINT emotional_caregiver_alerts_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  `);
};
