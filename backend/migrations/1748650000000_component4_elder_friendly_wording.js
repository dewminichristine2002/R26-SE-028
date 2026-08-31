/* eslint-disable camelcase */
exports.shorthands = undefined;

/**
 * Elder-friendly wording audit (Part 3 of the conversational upgrade).
 *
 * Only question_text and quick_replies change. target_state,
 * assessment_dimension, is_assessment, min_confidence, branch codes and
 * selector behaviour are intentionally untouched so research semantics are
 * preserved exactly.
 *
 * Rewrites (6 texts):
 * - lonely_contact_helpful      shorter daily-life phrasing
 * - lonely_daily_engagement     one idea per question
 * - anger_supportive_factor     shorter daily-life phrasing
 * - happy_energy_today          natural energy phrasing
 * - cognitive_engagement_today  short focus phrasing
 * - neutral_daily_engagement    removes double clause
 *
 * Quick-reply fixes/additions (4 sets), kept balanced:
 * - anxious_relax_today         replies now match a "times" question
 * - lonely_daily_engagement     replies added
 * - happy_energy_today          replies added
 * - cognitive_engagement_today  replies added
 */

const textUpdates = [
  ['lonely_contact_helpful',
    'Did talking with someone help you feel better today?',
    'Did any contact with another person help you feel supported today?'],
  ['lonely_daily_engagement',
    'Did you spend time doing something you enjoy today?',
    'Was there anything today that helped you feel involved or connected?'],
  ['anger_supportive_factor',
    'Did anything help the day feel better?',
    'Was there anything or anyone that helped the situation feel better?'],
  ['happy_energy_today',
    'How has your energy felt today?',
    'How did your energy help you with your day?'],
  ['cognitive_engagement_today',
    'Did something keep your interest today?',
    'Was there an activity or conversation that held your attention today?'],
  ['neutral_daily_engagement',
    'What did you spend time doing today?',
    'What have you enjoyed doing, or spent time doing, today?'],
];

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

const quickReplyUpdates = {
  anxious_relax_today: ['Yes, there were', 'A little', 'Not really'],
  lonely_daily_engagement: ['Yes, I did', 'A little', 'Not really'],
  happy_energy_today: ['Good energy', 'About usual', 'A bit tired'],
  cognitive_engagement_today: ['Yes, it did', 'A little', 'Not really'],
};

// Originals for exact reversal.
const originalQuickReplies = {
  anxious_relax_today: ['Yes, I did', 'A little', 'Not really'],
  lonely_daily_engagement: null,
  happy_energy_today: null,
  cognitive_engagement_today: null,
};

function quickReplyJson(labels) {
  if (!labels) return 'NULL';
  const payload = labels.map((label, index) => ({ id: `reply_${index + 1}`, label, value: label }));
  return `${sqlString(JSON.stringify(payload))}::jsonb`;
}

exports.up = (pgm) => {
  pgm.sql(`
    ${textUpdates.map(([code, newText]) =>
      `UPDATE adaptive_question_bank SET question_text = ${sqlString(newText)} WHERE question_code = '${code}';`
    ).join('\n')}

    ${Object.entries(quickReplyUpdates).map(([code, labels]) =>
      `UPDATE adaptive_question_bank SET quick_replies = ${quickReplyJson(labels)} WHERE question_code = '${code}';`
    ).join('\n')}
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ${textUpdates.map(([code, , originalText]) =>
      `UPDATE adaptive_question_bank SET question_text = ${sqlString(originalText)} WHERE question_code = '${code}';`
    ).join('\n')}

    ${Object.entries(originalQuickReplies).map(([code, labels]) =>
      `UPDATE adaptive_question_bank SET quick_replies = ${quickReplyJson(labels)} WHERE question_code = '${code}';`
    ).join('\n')}
  `);
};

exports.rewrittenQuestionCount = textUpdates.length;
exports.updatedQuickReplyCount = Object.keys(quickReplyUpdates).length;