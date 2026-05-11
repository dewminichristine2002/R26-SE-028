/* eslint-disable camelcase */
exports.shorthands = undefined;

const { chunksWithEmbeddings } = require('../src/data/healthAdviceKnowledge');

const sqlValue = (value) => `'${String(value == null ? '' : value).replace(/'/g, "''")}'`;

exports.up = (pgm) => {
  pgm.createTable(
    'health_advice_chunks',
    {
      id: 'id',
      source_name: { type: 'text', notNull: true },
      source_url: { type: 'text', notNull: true },
      risk_type: { type: 'text', notNull: true },
      topic: { type: 'text', notNull: true },
      content_chunk: { type: 'text', notNull: true },
      embedding: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('health_advice_chunks', ['risk_type', 'topic'], {
    name: 'health_advice_chunks_risk_topic_idx',
    ifNotExists: true,
  });

  pgm.createIndex('health_advice_chunks', ['source_url', 'risk_type', 'topic'], {
    name: 'health_advice_chunks_unique_source_topic_idx',
    unique: true,
    ifNotExists: true,
  });

  chunksWithEmbeddings().forEach((chunk) => {
    pgm.sql(`
      INSERT INTO health_advice_chunks (
        source_name,
        source_url,
        risk_type,
        topic,
        content_chunk,
        embedding,
        updated_at
      )
      VALUES (
        ${sqlValue(chunk.sourceName)},
        ${sqlValue(chunk.sourceUrl)},
        ${sqlValue(chunk.riskType)},
        ${sqlValue(chunk.topic)},
        ${sqlValue(chunk.contentChunk)},
        '${JSON.stringify(chunk.embedding)}'::jsonb,
        NOW()
      )
      ON CONFLICT (source_url, risk_type, topic)
      DO UPDATE SET
        source_name = EXCLUDED.source_name,
        content_chunk = EXCLUDED.content_chunk,
        embedding = EXCLUDED.embedding,
        updated_at = NOW()
    `);
  });
};

exports.down = (pgm) => {
  pgm.dropTable('health_advice_chunks', { ifExists: true, cascade: true });
};
