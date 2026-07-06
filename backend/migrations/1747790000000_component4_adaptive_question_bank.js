/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- Adaptive question bank for Component 4 guided reminiscence chat.
    -- This migration is intentionally separate from the older Component 4
    -- migration because some databases may have already recorded that file.
    CREATE TABLE IF NOT EXISTS adaptive_question_bank (
      question_id SERIAL PRIMARY KEY,
      question_code VARCHAR(80) UNIQUE NOT NULL,
      phase VARCHAR(50) NOT NULL,
      category VARCHAR(80) NOT NULL,
      sub_category VARCHAR(100),
      target_state VARCHAR(50) NOT NULL,
      question_type VARCHAR(50) NOT NULL,
      trigger_keywords TEXT[],
      question_text TEXT NOT NULL,
      response_type VARCHAR(50) NOT NULL,
      priority INTEGER DEFAULT 1,
      construct_source VARCHAR(150),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS adaptive_question_bank_phase_priority_idx
      ON adaptive_question_bank (phase, priority, is_active);

    CREATE INDEX IF NOT EXISTS adaptive_question_bank_target_state_idx
      ON adaptive_question_bank (target_state, is_active);

    CREATE INDEX IF NOT EXISTS adaptive_question_bank_question_type_idx
      ON adaptive_question_bank (question_type, is_active);

    INSERT INTO adaptive_question_bank (
      question_code,
      phase,
      category,
      sub_category,
      target_state,
      question_type,
      trigger_keywords,
      question_text,
      response_type,
      priority,
      construct_source
    ) VALUES
      ('open_day_so_far', 'opening', 'emotional_check_in', 'daily_opening', 'neutral', 'opening', ARRAY['day', 'today', 'morning'], 'How has your day been so far?', 'free_text', 1, 'General supportive mood opening. Not a diagnostic tool.'),
      ('open_memory_moment', 'opening', 'emotional_check_in', 'memory_opening', 'mental_stimulation', 'opening', ARRAY['memory', 'moment', 'came to mind'], 'What memory or moment came to your mind today?', 'free_text', 2, 'Reminiscence warm-up prompt. Not a diagnostic tool.'),

      ('lonely_miss_someone', 'adaptive', 'emotional_sharing', 'connection', 'loneliness', 'follow_up', ARRAY['miss', 'someone', 'family'], 'Would you like to talk about someone you miss today?', 'free_text', 1, 'Social connection support. Not a diagnostic tool.'),
      ('lonely_quiet_house', 'adaptive', 'environmental_context', 'quiet_space', 'loneliness', 'follow_up', ARRAY['quiet', 'silent', 'alone'], 'Did the house feel quiet today?', 'yes_no', 1, 'Perceived social isolation cue. Not a diagnostic tool.'),
      ('lonely_family_friends_memory', 'adaptive', 'emotional_sharing', 'family_friends', 'loneliness', 'follow_up', ARRAY['family', 'friends', 'memory'], 'Would you like to share a memory about your family or friends?', 'free_text', 1, 'Social reminiscence support. Not a diagnostic tool.'),
      ('lonely_message_trusted_person', 'adaptive', 'social_connection', 'outreach', 'loneliness', 'activity_offer', ARRAY['message', 'trust', 'call'], 'Would you like to send a short message to someone you trust?', 'yes_no', 2, 'Gentle outreach support. Not a diagnostic tool.'),

      ('sad_share_difficult', 'adaptive', 'emotional_sharing', 'difficulty', 'sadness', 'follow_up', ARRAY['difficult', 'hard', 'heavy'], 'Would you like to share what made today feel difficult?', 'free_text', 1, 'Supportive expression prompt. Not a diagnostic tool.'),
      ('sad_music_help', 'adaptive', 'activity_offer', 'soothing_music', 'sadness', 'activity_offer', ARRAY['music', 'listen', 'song'], 'Would listening to calming music help right now?', 'yes_no', 2, 'Mood-supportive sensory activity. Not a diagnostic tool.'),

      ('anxious_worried_today', 'adaptive', 'emotional_sharing', 'worry', 'anxiety', 'follow_up', ARRAY['worried', 'nervous', 'stress'], 'Did anything make you feel worried today?', 'free_text', 1, 'Worry-related supportive prompt. Not a diagnostic tool.'),
      ('anxious_breathing_help', 'adaptive', 'calming_support', 'breathing', 'anxiety', 'activity_offer', ARRAY['breathing', 'calm', 'slow'], 'Would a short breathing activity help you feel calmer?', 'yes_no', 1, 'Calming support cue. Not a diagnostic tool.'),

      ('happy_special_memory', 'adaptive', 'positive_affect', 'meaning', 'happiness', 'follow_up', ARRAY['special', 'what made', 'memory'], 'What made this memory special to you?', 'free_text', 1, 'Positive autobiographical memory. Not a diagnostic tool.'),
      ('happy_memory_journal', 'adaptive', 'activity_offer', 'journaling', 'happiness', 'activity_offer', ARRAY['journal', 'add', 'memory'], 'Would you like to add this to your memory journal?', 'yes_no', 2, 'Reflective journaling support. Not a diagnostic tool.'),

      ('anger_take_pause', 'adaptive', 'de_escalation', 'pause', 'anger', 'activity_offer', ARRAY['pause', 'continue', 'calm'], 'Would you like to take a calm pause before continuing?', 'yes_no', 1, 'Emotional pacing support. Not a diagnostic tool.'),
      ('anger_frustrating_today', 'adaptive', 'emotional_sharing', 'frustration', 'anger', 'follow_up', ARRAY['frustrating', 'annoying', 'upset'], 'Did something make today feel frustrating?', 'free_text', 1, 'Frustration expression prompt. Not a diagnostic tool.'),

      ('memory_simple_activity', 'adaptive', 'cognitive_support', 'memory_practice', 'cognitive_fog', 'activity_offer', ARRAY['memory', 'activity', 'simple'], 'Would you like to try one simple memory activity?', 'yes_no', 1, 'Recall and engagement support. Not a diagnostic tool.'),
      ('memory_morning_task', 'adaptive', 'routine_recall', 'morning', 'cognitive_fog', 'follow_up', ARRAY['morning', 'today', 'did'], 'Would you like to recall one thing you did this morning?', 'free_text', 2, 'Routine recall support. Not a diagnostic tool.'),

      ('neutral_continue_memory', 'adaptive', 'reminiscence', 'general_memory', 'neutral', 'follow_up', ARRAY['memory', 'story', 'today'], 'Would you like to continue with another memory?', 'free_text', 1, 'General reminiscence support. Not a diagnostic tool.'),
      ('neutral_choose_activity', 'adaptive', 'activity_offer', 'standard_menu', 'neutral', 'activity_offer', ARRAY['activity', 'music', 'journal'], 'Would you like music, a memory question, or a small activity?', 'yes_no', 2, 'General engagement support. Not a diagnostic tool.')
    ON CONFLICT (question_code) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('adaptive_question_bank', { ifExists: true, cascade: true });
};
