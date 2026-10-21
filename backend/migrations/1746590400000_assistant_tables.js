/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    'assistant_conversations',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      title: { type: 'text', notNull: true, default: 'New conversation' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('assistant_conversations', ['user_id', 'updated_at'], {
    name: 'assistant_conversations_user_updated_idx',
    ifNotExists: true,
  });

  pgm.createTable(
    'assistant_messages',
    {
      id: 'id',
      conversation_id: {
        type: 'integer',
        notNull: true,
        references: '"assistant_conversations"',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      role: {
        type: 'text',
        notNull: true,
        check: "role IN ('user', 'assistant', 'system')",
      },
      content: { type: 'text', notNull: true, default: '' },
      sql_used: { type: 'text', notNull: true, default: '' },
      rows_returned: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
      intent: { type: 'text', notNull: true, default: '' },
      fallback_reason: { type: 'text', notNull: true, default: '' },
      latency_ms: { type: 'integer' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('assistant_messages', ['conversation_id', 'created_at'], {
    name: 'assistant_messages_conv_created_idx',
    ifNotExists: true,
  });

  pgm.createIndex('assistant_messages', ['user_id', 'created_at'], {
    name: 'assistant_messages_user_created_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropTable('assistant_messages', { ifExists: true, cascade: true });
  pgm.dropTable('assistant_conversations', { ifExists: true, cascade: true });
};
