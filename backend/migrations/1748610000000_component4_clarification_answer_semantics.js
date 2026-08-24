/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    UPDATE adaptive_question_bank SET
      positive_response_effect = 'preserve_previous',
      negative_response_effect = 'preserve_previous',
      neutral_response_effect = 'preserve_previous'
    WHERE question_code = 'sad_share_difficult';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE adaptive_question_bank SET
      positive_response_effect = NULL,
      negative_response_effect = NULL,
      neutral_response_effect = NULL
    WHERE question_code = 'sad_share_difficult';
  `);
};
