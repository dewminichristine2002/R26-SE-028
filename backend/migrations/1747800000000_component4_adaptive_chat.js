/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Adaptive chat sessions track a short guided exchange for Component 4.
    CREATE TABLE IF NOT EXISTS adaptive_chat_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
      current_state VARCHAR(50),
      turn_count INTEGER DEFAULT 0,
      is_complete BOOLEAN DEFAULT FALSE,
      final_emotional_state VARCHAR(50),
      risk_level VARCHAR(20),
      support_directive JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS adaptive_chat_turns (
      turn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES adaptive_chat_sessions(session_id) ON DELETE CASCADE,
      question_id INTEGER REFERENCES adaptive_question_bank(question_id) ON DELETE SET NULL,
      user_answer TEXT,
      detected_state VARCHAR(50),
      confidence_score NUMERIC(5,2),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS adaptive_chat_sessions_user_created_idx
      ON adaptive_chat_sessions (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS adaptive_chat_sessions_complete_idx
      ON adaptive_chat_sessions (is_complete, updated_at DESC);

    CREATE INDEX IF NOT EXISTS adaptive_chat_turns_session_created_idx
      ON adaptive_chat_turns (session_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS adaptive_chat_turns_question_idx
      ON adaptive_chat_turns (question_id);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('adaptive_chat_turns', { ifExists: true, cascade: true });
  pgm.dropTable('adaptive_chat_sessions', { ifExists: true, cascade: true });
};