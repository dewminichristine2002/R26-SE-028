/* eslint-disable camelcase */
exports.shorthands = undefined;

const replies = {
  open_day_so_far: ['Pretty good', 'Just okay', 'A little difficult'],
  open_things_felt: ['Mostly good', 'About the same', 'A little difficult'],
  neutral_usual_interest: ['Yes, I have', 'A little', 'Not really'],
  neutral_energy_today: ['Good energy', 'About normal', 'A bit tired'],
  neutral_positive_moment: ['Yes, something did', 'A little', 'Not really'],
  lonely_quiet_house: ['Not really', 'A little', 'Very quiet'],
  lonely_spoke_someone: ['Yes, I did', 'A little', 'Not today'],
  lonely_contact_helpful: ['Yes, it did', 'A little', 'Not really'],
  lonely_companionship: ['Yes, enough', 'Some company', 'Not really'],
  sad_energy_today: ['Quite easy', 'About usual', 'A little difficult'],
  sad_usual_interest: ['Yes, they did', 'A little', 'Not really'],
  sad_supportive_moment: ['Yes, something did', 'A little', 'Not really'],
  sad_daily_engagement: ['Manageable', 'About usual', 'A little difficult'],
  anxious_worried_today: ['Not really', 'A little', 'Quite a bit'],
  anxious_relax_today: ['Yes, I did', 'A little', 'Not really'],
  anxious_daily_tasks: ['Not really', 'A little', 'Quite a bit'],
  anxious_supportive_factor: ['Yes, something did', 'A little', 'Not really'],
  anger_calm_period: ['Yes, it eased', 'A little', 'Not really'],
  anger_daily_engagement: ['Not really', 'A little', 'Quite a bit'],
  anger_supportive_factor: ['Yes, something did', 'A little', 'Not really'],
  happy_social_connection: ['Yes, I did', 'A little', 'Not today'],
  cognitive_concentration_today: ['Quite easy', 'About usual', 'A little difficult'],
  cognitive_daily_tasks: ['Mostly clear', 'About usual', 'A little confusing'],
  cognitive_clear_period: ['Yes, there was', 'A little', 'Not really'],
};

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const rows = Object.entries(replies).map(([questionCode, labels]) => {
  const quickReplies = labels.map((label, index) => ({
    id: `reply_${index + 1}`,
    label,
    value: label,
  }));
  return `(${sqlString(questionCode)}, ${sqlString(JSON.stringify(quickReplies))}::jsonb)`;
});

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_question_bank
      ADD COLUMN IF NOT EXISTS quick_replies JSONB;

    UPDATE adaptive_question_bank AS bank
    SET quick_replies = curated.quick_replies
    FROM (VALUES ${rows.join(',\n')}) AS curated(question_code, quick_replies)
    WHERE bank.question_code = curated.question_code;

    ALTER TABLE adaptive_question_bank
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_quick_replies_array_check,
      ADD CONSTRAINT adaptive_question_bank_quick_replies_array_check CHECK (
        quick_replies IS NULL OR jsonb_typeof(quick_replies) = 'array'
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_question_bank
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_quick_replies_array_check,
      DROP COLUMN IF EXISTS quick_replies;
  `);
};

exports.quickReplyQuestionCount = Object.keys(replies).length;
