/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  const rows = [
    ['word_completion', 'Word Completion', 'Complete familiar words by typing the missing letter.', 'neutral'],
    ['odd_one_out', 'Odd One Out', 'Choose the item that differs from the others.', 'neutral'],
    ['short_memory_recall', 'Short Memory Recall', 'Remember a few familiar items at your own pace.', 'neutral'],
  ];
  for (const [type, title, description, target] of rows) {
    const key = `${type}_hard`;
    const task = JSON.stringify({ bankVersion: 'cognitive-bank-v1', activityType: type, difficulty: 'hard' });
    pgm.sql(`INSERT INTO support_activities (activity_key, activity_title, activity_type, target_emotion, instruction_text, category, difficulty, estimated_duration_minutes, short_description, task_definition, is_active)
      VALUES ('${key}', '${title}', '${type}', '${target}', '${description}', 'cognitive_engagement', 'hard', 4, '${description}', '${task}'::jsonb, TRUE)
      ON CONFLICT (activity_key) DO UPDATE SET is_active = TRUE, task_definition = EXCLUDED.task_definition, difficulty = 'hard';`);
  }
};

exports.down = (pgm) => pgm.sql(`DELETE FROM support_activities WHERE activity_key IN ('word_completion_hard', 'odd_one_out_hard', 'short_memory_recall_hard');`);
