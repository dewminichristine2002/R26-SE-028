/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE emotional_caregiver_alerts
      ADD COLUMN IF NOT EXISTS adaptive_session_id UUID REFERENCES adaptive_chat_sessions(session_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS emotional_state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20),
      ADD COLUMN IF NOT EXISTS matching_concern_count_7d INTEGER,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'unread',
      ADD COLUMN IF NOT EXISTS explanation JSONB NOT NULL DEFAULT '{}'::JSONB;

    ALTER TABLE emotional_caregiver_alerts
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_status_check,
      ADD CONSTRAINT emotional_caregiver_alerts_status_check
        CHECK (status IN ('unread', 'read', 'acknowledged')),
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_matching_count_check,
      ADD CONSTRAINT emotional_caregiver_alerts_matching_count_check
        CHECK (matching_concern_count_7d IS NULL OR matching_concern_count_7d >= 0);

    UPDATE emotional_caregiver_alerts
    SET status = 'acknowledged'
    WHERE is_acknowledged = TRUE AND status = 'unread';

    CREATE UNIQUE INDEX IF NOT EXISTS emotional_caregiver_alerts_adaptive_session_type_uidx
      ON emotional_caregiver_alerts (adaptive_session_id, alert_type)
      WHERE adaptive_session_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS emotional_caregiver_alerts_episode_idx
      ON emotional_caregiver_alerts (user_id, emotional_state, created_at DESC)
      WHERE alert_type = 'repeated_emotional_concern';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS emotional_caregiver_alerts_episode_idx;
    DROP INDEX IF EXISTS emotional_caregiver_alerts_adaptive_session_type_uidx;
    ALTER TABLE emotional_caregiver_alerts
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_matching_count_check,
      DROP CONSTRAINT IF EXISTS emotional_caregiver_alerts_status_check,
      DROP COLUMN IF EXISTS explanation,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS matching_concern_count_7d,
      DROP COLUMN IF EXISTS emotional_state,
      DROP COLUMN IF EXISTS risk_level,
      DROP COLUMN IF EXISTS adaptive_session_id;
  `);
};
