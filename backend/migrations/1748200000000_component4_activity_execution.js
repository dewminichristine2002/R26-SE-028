/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE support_activities ADD COLUMN IF NOT EXISTS task_definition JSONB;`);
  pgm.sql(`
    UPDATE support_activities SET task_definition = CASE activity_key
      WHEN 'word_category_easy' THEN '{"kind":"single_choice","prompt":"Which item is different from the others?","options":["Apple","Banana","Carrot"],"correctAnswer":"Carrot"}'::jsonb
      WHEN 'pattern_matching_medium' THEN '{"kind":"single_choice","prompt":"What comes next: circle, square, circle, square?","options":["Circle","Triangle","Star"],"correctAnswer":"Circle"}'::jsonb
      WHEN 'short_memory_recall_easy' THEN '{"kind":"multi_recall","prompt":"Remember these four familiar items, then select the items you saw.","studyItems":["Book","Cup","Key","Flower"],"options":["Book","Ball","Cup","Key","Spoon","Flower"],"correctAnswers":["Book","Cup","Key","Flower"]}'::jsonb
      WHEN 'orientation_activity_easy' THEN '{"kind":"single_choice","prompt":"Which part of the day comes after morning?","options":["Afternoon","Night","Morning"],"correctAnswer":"Afternoon"}'::jsonb
      ELSE task_definition
    END
    WHERE activity_key IN ('word_category_easy', 'pattern_matching_medium', 'short_memory_recall_easy', 'orientation_activity_easy');
  `);
  pgm.createTable('adaptive_activity_attempts', {
    attempt_id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'integer', notNull: true, references: 'users', onDelete: 'CASCADE' },
    adaptive_session_id: { type: 'uuid', notNull: true, references: 'adaptive_chat_sessions', onDelete: 'CASCADE' },
    activity_id: { type: 'integer', notNull: true, references: 'support_activities', onDelete: 'RESTRICT' },
    activity_code: { type: 'varchar(100)', notNull: true },
    category: { type: 'varchar(50)', notNull: true },
    activity_type: { type: 'varchar(80)', notNull: true },
    difficulty: { type: 'varchar(20)', notNull: true },
    task_snapshot: { type: 'jsonb' },
    user_response: { type: 'jsonb' },
    is_correct: { type: 'boolean' },
    accuracy_score: { type: 'numeric(5,4)' },
    response_time_ms: { type: 'integer' },
    completion_status: { type: 'varchar(20)', notNull: true, default: 'started' },
    recommended_next_difficulty: { type: 'varchar(20)' },
    difficulty_explanation: { type: 'jsonb' },
    started_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    completed_at: { type: 'timestamptz' },
  }, { ifNotExists: true });
  pgm.createIndex('adaptive_activity_attempts', ['user_id', { name: 'started_at', sort: 'DESC' }], { name: 'adaptive_activity_attempts_user_started_idx', ifNotExists: true });
  pgm.createIndex('adaptive_activity_attempts', ['adaptive_session_id'], { name: 'adaptive_activity_attempts_session_idx', ifNotExists: true });
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS adaptive_activity_attempts_one_active_idx ON adaptive_activity_attempts (adaptive_session_id, activity_code) WHERE completed_at IS NULL;`);
};

exports.down = (pgm) => {
  pgm.dropTable('adaptive_activity_attempts', { ifExists: true, cascade: true });
  pgm.sql(`ALTER TABLE support_activities DROP COLUMN IF EXISTS task_definition;`);
};
