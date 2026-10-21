/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Consent-based personalized reminiscence topics.
    -- Stores ONLY structured safe memory topics (never raw private
    -- transcripts, credentials, financial or clinical data).
    CREATE TABLE IF NOT EXISTS reminiscence_user_topics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
      topic_type VARCHAR(50) NOT NULL,
      topic_label VARCHAR(80),
      safe_detail VARCHAR(120),
      source_activity_id VARCHAR(80),
      consent_status BOOLEAN NOT NULL DEFAULT FALSE,
      consent_recorded_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT reminiscence_user_topics_consent_check CHECK (
        consent_status = FALSE OR consent_recorded_at IS NOT NULL
      )
    );

    CREATE INDEX IF NOT EXISTS reminiscence_user_topics_user_active_idx
      ON reminiscence_user_topics (user_id, is_active, created_at DESC);

    CREATE INDEX IF NOT EXISTS reminiscence_user_topics_last_used_idx
      ON reminiscence_user_topics (user_id, last_used_at NULLS FIRST)
      WHERE is_active = TRUE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS reminiscence_user_topics_last_used_idx;
    DROP INDEX IF EXISTS reminiscence_user_topics_user_active_idx;
    DROP TABLE IF EXISTS reminiscence_user_topics;
  `);
};