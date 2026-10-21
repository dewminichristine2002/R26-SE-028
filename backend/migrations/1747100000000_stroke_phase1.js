/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    'stroke_risk_predictions',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      risk_type: { type: 'text', notNull: true, default: 'Stroke' },
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

  pgm.createIndex('stroke_risk_predictions', ['user_id', 'created_at'], {
    name: 'stroke_predictions_user_created_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropTable('stroke_risk_predictions', { ifExists: true, cascade: true });
};
