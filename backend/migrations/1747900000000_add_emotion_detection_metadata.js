/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS narrative_logs
      ADD COLUMN IF NOT EXISTS detection_source VARCHAR(50) DEFAULT 'rule_fallback',
      ADD COLUMN IF NOT EXISTS model_version VARCHAR(80);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE IF EXISTS narrative_logs
      DROP COLUMN IF EXISTS model_version,
      DROP COLUMN IF EXISTS detection_source;
  `);
};
