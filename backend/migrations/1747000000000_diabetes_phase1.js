/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    'user_health_profiles',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        unique: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      age: { type: 'integer' },
      gender: { type: 'text' },
      blood_sugar: { type: 'numeric' },
      systolic_bp: { type: 'numeric' },
      diastolic_bp: { type: 'numeric' },
      height_cm: { type: 'numeric' },
      weight_kg: { type: 'numeric' },
      smoking_status: { type: 'text' },
      physical_activity_level: { type: 'text' },
      family_history: { type: 'text' },
      existing_disease_history: { type: 'text[]', notNull: true, default: '{}' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'diabetes_risk_predictions',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      risk_type: { type: 'text', notNull: true, default: 'Diabetes' },
      risk_level: { type: 'text', notNull: true },
      confidence: { type: 'integer', notNull: true },
      probability: { type: 'numeric' },
      selected_algorithm: { type: 'text', notNull: true, default: '' },
      factors: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
      input_snapshot: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
      summary: { type: 'text', notNull: true, default: '' },
      conversation_id: {
        type: 'integer',
        references: '"assistant_conversations"',
        onDelete: 'SET NULL',
      },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('diabetes_risk_predictions', ['user_id', 'created_at'], {
    name: 'diabetes_predictions_user_created_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropTable('diabetes_risk_predictions', { ifExists: true, cascade: true });
  pgm.dropTable('user_health_profiles', { ifExists: true, cascade: true });
};
