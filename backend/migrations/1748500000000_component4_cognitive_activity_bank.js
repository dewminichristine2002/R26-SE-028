/* eslint-disable camelcase */
exports.shorthands = undefined;

const activities = [
  ['word_category', 'Word Category Match', 'word_category', 'Find the item that belongs to the named group.'],
  ['odd_one_out', 'Odd One Out', 'odd_one_out', 'Notice which everyday item does not belong.'],
  ['word_completion', 'Word Completion', 'word_completion', 'Complete familiar words from a clear choice.'],
  ['pattern_sequence', 'Pattern Sequence', 'pattern_sequence', 'Find what comes next in a simple pattern.'],
  ['short_memory_recall', 'Short Memory Recall', 'short_memory_recall', 'Take a moment to remember a few familiar items.'],
  ['orientation_activity', 'Orientation Activity', 'orientation_activity', 'Enjoy simple questions about everyday time and order.'],
  ['simple_math', 'Simple Math & Counting', 'simple_math', 'Work through friendly everyday number questions.'],
  ['sequence_ordering', 'Sequence Ordering', 'sequence_ordering', 'Arrange familiar everyday steps in order.'],
];

exports.up = (pgm) => {
  pgm.sql(`UPDATE support_activities SET is_active = FALSE WHERE activity_key = 'pattern_matching_medium';`);
  for (const [type, title, activityType, description] of activities) {
    for (const difficulty of ['easy', 'medium']) {
      const key = `${type}_${difficulty}`;
      const duration = difficulty === 'easy' ? 2 : 3;
      const taskDefinition = JSON.stringify({ bankVersion: 'cognitive-bank-v1', activityType: type, difficulty });
      pgm.sql(`
        INSERT INTO support_activities (
          activity_key, activity_title, activity_type, target_emotion, instruction_text,
          category, difficulty, estimated_duration_minutes, short_description, task_definition, is_active
        ) VALUES (
          '${key}', '${title.replace(/'/g, "''")}', '${activityType}', 'neutral',
          '${description.replace(/'/g, "''")}', 'cognitive_engagement', '${difficulty}', ${duration},
          '${description.replace(/'/g, "''")}', '${taskDefinition}'::jsonb, TRUE
        )
        ON CONFLICT (activity_key) DO UPDATE SET
          activity_title = EXCLUDED.activity_title, activity_type = EXCLUDED.activity_type,
          instruction_text = EXCLUDED.instruction_text, category = EXCLUDED.category,
          difficulty = EXCLUDED.difficulty, estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
          short_description = EXCLUDED.short_description, task_definition = EXCLUDED.task_definition,
          is_active = TRUE;
      `);
    }
  }
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM support_activities WHERE activity_key IN (
    'word_category_medium', 'odd_one_out_easy', 'odd_one_out_medium',
    'word_completion_easy', 'word_completion_medium', 'pattern_sequence_easy',
    'pattern_sequence_medium', 'short_memory_recall_medium', 'orientation_activity_medium',
    'simple_math_easy', 'simple_math_medium', 'sequence_ordering_easy', 'sequence_ordering_medium'
  );`);
  pgm.sql(`
    UPDATE support_activities SET activity_title = 'Quick Word Match', activity_type = 'word_association', target_emotion = 'neutral',
      instruction_text = 'Choose the item that belongs to a different everyday category.', estimated_duration_minutes = 2,
      short_description = 'A short, simple word-group activity.',
      task_definition = '{"kind":"single_choice","prompt":"Which item is different from the others?","options":["Apple","Banana","Carrot"],"correctAnswer":"Carrot"}'::jsonb
    WHERE activity_key = 'word_category_easy';
    UPDATE support_activities SET activity_title = 'Short Memory Recall', activity_type = 'memory_recall', target_emotion = 'neutral',
      instruction_text = 'Look at three familiar objects, pause briefly, and recall the objects.', estimated_duration_minutes = 2,
      short_description = 'A brief recall activity using familiar objects.',
      task_definition = '{"kind":"multi_recall","prompt":"Remember these four familiar items, then select the items you saw.","studyItems":["Book","Cup","Key","Flower"],"options":["Book","Ball","Cup","Key","Spoon","Flower"],"correctAnswers":["Book","Cup","Key","Flower"]}'::jsonb
    WHERE activity_key = 'short_memory_recall_easy';
    UPDATE support_activities SET activity_title = 'Today and Around You', activity_type = 'orientation_activity', target_emotion = 'cognitive_fog',
      instruction_text = 'Choose the current part of the day and one familiar thing around you.', estimated_duration_minutes = 2,
      short_description = 'A simple everyday orientation activity.',
      task_definition = '{"kind":"single_choice","prompt":"Which part of the day comes after morning?","options":["Afternoon","Night","Morning"],"correctAnswer":"Afternoon"}'::jsonb
    WHERE activity_key = 'orientation_activity_easy';
    UPDATE support_activities SET is_active = TRUE WHERE activity_key = 'pattern_matching_medium';
  `);
};
