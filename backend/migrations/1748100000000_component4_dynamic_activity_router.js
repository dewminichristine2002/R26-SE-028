/* eslint-disable camelcase */
exports.shorthands = undefined;

const activityCodes = [
  'word_category_easy', 'pattern_matching_medium', 'short_memory_recall_easy',
  'orientation_activity_easy', 'positive_reminiscence_easy', 'guided_breathing_easy',
  'gentle_pause_easy',
];

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE support_activities
      ADD COLUMN IF NOT EXISTS category VARCHAR(50),
      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20),
      ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER,
      ADD COLUMN IF NOT EXISTS short_description TEXT;

    INSERT INTO support_activities (
      activity_key, activity_title, activity_type, target_emotion, instruction_text,
      category, difficulty, estimated_duration_minutes, short_description, is_active
    ) VALUES
      ('word_category_easy', 'Quick Word Match', 'word_association', 'neutral',
       'Choose the item that belongs to a different everyday category.',
       'cognitive_engagement', 'easy', 2, 'A short, simple word-group activity.', TRUE),
      ('pattern_matching_medium', 'Gentle Pattern Match', 'pattern_matching', 'happiness',
       'Look at a simple shape pattern and choose what comes next.',
       'cognitive_engagement', 'medium', 3, 'A light pattern activity with clear choices.', TRUE),
      ('short_memory_recall_easy', 'Short Memory Recall', 'memory_recall', 'neutral',
       'Look at three familiar objects, pause briefly, and recall the objects.',
       'cognitive_engagement', 'easy', 2, 'A brief recall activity using familiar objects.', TRUE),
      ('orientation_activity_easy', 'Today and Around You', 'orientation_activity', 'cognitive_fog',
       'Choose the current part of the day and one familiar thing around you.',
       'cognitive_engagement', 'easy', 2, 'A simple everyday orientation activity.', TRUE),
      ('positive_reminiscence_easy', 'A Pleasant Memory', 'happy_event_recall', 'loneliness',
       'Choose a favorite place, past hobby, celebration, song, or meaningful person and share one pleasant detail.',
       'reminiscence_engagement', 'easy', 3, 'A gentle prompt about a safe and pleasant memory.', TRUE),
      ('guided_breathing_easy', 'Slow Breathing Pause', 'guided_breathing', 'anxiety',
       'Sit comfortably, breathe in slowly, pause briefly, and breathe out gently three times.',
       'calming_support', 'easy', 2, 'A short guided breathing pause.', TRUE),
      ('gentle_pause_easy', 'Gentle Pause', 'gentle_pause', 'anger',
       'Pause, notice one thing you can see and one thing you can feel, then take one gentle breath.',
       'calming_support', 'easy', 1, 'A very short grounding and breathing pause.', TRUE)
    ON CONFLICT (activity_key) DO UPDATE SET
      activity_title = EXCLUDED.activity_title,
      activity_type = EXCLUDED.activity_type,
      target_emotion = EXCLUDED.target_emotion,
      instruction_text = EXCLUDED.instruction_text,
      category = EXCLUDED.category,
      difficulty = EXCLUDED.difficulty,
      estimated_duration_minutes = EXCLUDED.estimated_duration_minutes,
      short_description = EXCLUDED.short_description,
      is_active = EXCLUDED.is_active;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DELETE FROM support_activities WHERE activity_key IN (${activityCodes.map((code) => `'${code}'`).join(', ')});`);
  pgm.sql(`
    ALTER TABLE support_activities
      DROP COLUMN IF EXISTS short_description,
      DROP COLUMN IF EXISTS estimated_duration_minutes,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS category;
  `);
};
