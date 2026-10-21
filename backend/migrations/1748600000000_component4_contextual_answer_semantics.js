/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_question_bank
      ADD COLUMN IF NOT EXISTS positive_response_effect VARCHAR(80),
      ADD COLUMN IF NOT EXISTS negative_response_effect VARCHAR(80),
      ADD COLUMN IF NOT EXISTS neutral_response_effect VARCHAR(80);

    UPDATE adaptive_question_bank SET
      positive_response_effect = 'supports:happiness',
      negative_response_effect = 'supports:sadness',
      neutral_response_effect = 'supports:neutral'
    WHERE assessment_dimension IN ('general_wellbeing', 'energy_motivation', 'daily_engagement')
      AND target_state = 'neutral';

    UPDATE adaptive_question_bank SET
      positive_response_effect = 'opposes:loneliness',
      negative_response_effect = 'supports:loneliness',
      neutral_response_effect = 'preserve_previous'
    WHERE assessment_dimension = 'social_connection' AND target_state = 'loneliness';

    UPDATE adaptive_question_bank SET
      positive_response_effect = 'supports:anxiety',
      negative_response_effect = 'opposes:anxiety',
      neutral_response_effect = 'preserve_previous'
    WHERE question_code IN ('anxious_worried_today', 'anxious_daily_tasks');

    UPDATE adaptive_question_bank SET
      positive_response_effect = 'opposes:anxiety',
      negative_response_effect = 'supports:anxiety',
      neutral_response_effect = 'preserve_previous'
    WHERE question_code IN ('anxious_relax_today', 'anxious_supportive_factor');

    UPDATE adaptive_question_bank SET
      positive_response_effect = 'supports:happiness',
      negative_response_effect = 'preserve_previous',
      neutral_response_effect = 'preserve_previous'
    WHERE assessment_dimension = 'positive_protective_factor';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_question_bank
      DROP COLUMN IF EXISTS neutral_response_effect,
      DROP COLUMN IF EXISTS negative_response_effect,
      DROP COLUMN IF EXISTS positive_response_effect;
  `);
};
