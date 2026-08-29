/* eslint-disable camelcase */
exports.shorthands = undefined;

const newQuestionCodes = [
  'open_mind_today', 'open_things_felt', 'neutral_usual_interest', 'neutral_energy_today',
  'neutral_daily_engagement', 'neutral_positive_moment', 'lonely_spoke_someone',
  'lonely_contact_helpful', 'lonely_companionship', 'lonely_daily_engagement',
  'sad_energy_today', 'sad_usual_interest', 'sad_supportive_moment', 'sad_daily_engagement',
  'anxious_relax_today', 'anxious_daily_tasks', 'anxious_supportive_factor',
  'anger_calm_period', 'anger_daily_engagement', 'anger_supportive_factor',
  'happy_daily_engagement', 'happy_energy_today', 'happy_social_connection',
  'cognitive_concentration_today', 'cognitive_daily_tasks', 'cognitive_clear_period',
  'cognitive_engagement_today',
];

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE adaptive_question_bank
      ADD COLUMN IF NOT EXISTS positive_next_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS negative_next_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS neutral_next_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS followup_next_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS assessment_dimension VARCHAR(50),
      ADD COLUMN IF NOT EXISTS is_assessment BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS min_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(30);

    ALTER TABLE adaptive_chat_sessions
      ADD COLUMN IF NOT EXISTS current_question_id INTEGER REFERENCES adaptive_question_bank(question_id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS final_confidence NUMERIC(5,4),
      ADD COLUMN IF NOT EXISTS conversation_engagement VARCHAR(50),
      ADD COLUMN IF NOT EXISTS recommended_activity VARCHAR(80),
      ADD COLUMN IF NOT EXISTS caregiver_notification_required BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

    ALTER TABLE adaptive_chat_turns
      ADD COLUMN IF NOT EXISTS question_number INTEGER,
      ADD COLUMN IF NOT EXISTS question_code VARCHAR(80),
      ADD COLUMN IF NOT EXISTS question_text TEXT,
      ADD COLUMN IF NOT EXISTS answer_polarity VARCHAR(20),
      ADD COLUMN IF NOT EXISTS risk_indicator VARCHAR(20),
      ADD COLUMN IF NOT EXISTS detection_source VARCHAR(50),
      ADD COLUMN IF NOT EXISTS model_version VARCHAR(80),
      ADD COLUMN IF NOT EXISTS analysis_metadata JSONB,
      ADD COLUMN IF NOT EXISTS selection_metadata JSONB;

    UPDATE adaptive_chat_turns turn_row
    SET question_code = bank.question_code,
        question_text = bank.question_text
    FROM adaptive_question_bank bank
    WHERE turn_row.question_id = bank.question_id
      AND (turn_row.question_code IS NULL OR turn_row.question_text IS NULL);

    WITH numbered_turns AS (
      SELECT turn_id,
             ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, turn_id) AS sequence_number
      FROM adaptive_chat_turns
      WHERE question_number IS NULL
    )
    UPDATE adaptive_chat_turns turn_row
    SET question_number = numbered_turns.sequence_number
    FROM numbered_turns
    WHERE turn_row.turn_id = numbered_turns.turn_id
      AND numbered_turns.sequence_number BETWEEN 1 AND 5;

    UPDATE adaptive_question_bank
    SET is_assessment = FALSE,
        assessment_dimension = NULL,
        difficulty = COALESCE(difficulty, 'gentle')
    WHERE question_code IN (
      'open_memory_moment', 'lonely_miss_someone', 'lonely_family_friends_memory',
      'lonely_message_trusted_person', 'sad_music_help', 'anxious_breathing_help',
      'happy_memory_journal', 'anger_take_pause', 'memory_simple_activity',
      'memory_morning_task', 'neutral_continue_memory', 'neutral_choose_activity'
    );

    UPDATE adaptive_question_bank
    SET is_assessment = TRUE,
        assessment_dimension = CASE question_code
          WHEN 'open_day_so_far' THEN 'general_wellbeing'
          WHEN 'lonely_quiet_house' THEN 'social_connection'
          WHEN 'sad_share_difficult' THEN 'clarification'
          WHEN 'anxious_worried_today' THEN 'worry_calmness'
          WHEN 'happy_special_memory' THEN 'positive_protective_factor'
          WHEN 'anger_frustrating_today' THEN 'clarification'
        END,
        difficulty = COALESCE(difficulty, 'gentle'),
        min_confidence = CASE WHEN target_state = 'neutral' THEN NULL ELSE 0.600 END
    WHERE question_code IN (
      'open_day_so_far', 'lonely_quiet_house', 'sad_share_difficult',
      'anxious_worried_today', 'happy_special_memory', 'anger_frustrating_today'
    );

    INSERT INTO adaptive_question_bank (
      question_code, phase, category, sub_category, target_state, question_type,
      trigger_keywords, question_text, response_type, priority, construct_source,
      assessment_dimension, is_assessment, min_confidence, difficulty,
      positive_next_code, negative_next_code, neutral_next_code, followup_next_code
    ) VALUES
      ('open_mind_today', 'opening', 'emotional_check_in', 'open_reflection', 'neutral', 'opening', ARRAY['mind','today','thinking'], 'What has been on your mind today?', 'free_text', 2, 'General non-diagnostic engagement opening.', 'general_wellbeing', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),
      ('open_things_felt', 'opening', 'emotional_check_in', 'open_feeling', 'neutral', 'opening', ARRAY['felt','feeling','today'], 'How have things felt for you today?', 'free_text', 3, 'General non-diagnostic engagement opening.', 'general_wellbeing', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),
      ('neutral_usual_interest', 'adaptive', 'daily_life', 'usual_interests', 'neutral', 'follow_up', ARRAY['interest','usual','activities'], 'Have you felt interested in your usual activities today?', 'free_text', 1, 'Daily engagement observation; not a diagnostic score.', 'daily_engagement', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),
      ('neutral_energy_today', 'adaptive', 'daily_life', 'energy', 'neutral', 'follow_up', ARRAY['energy','tired','active'], 'How has your energy been today?', 'free_text', 1, 'Daily energy observation; not a diagnostic score.', 'energy_motivation', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),
      ('neutral_daily_engagement', 'adaptive', 'daily_life', 'daily_activity', 'neutral', 'follow_up', ARRAY['doing','activity','today'], 'What have you enjoyed doing, or spent time doing, today?', 'free_text', 2, 'General daily engagement prompt.', 'daily_engagement', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),
      ('neutral_positive_moment', 'adaptive', 'protective_factor', 'positive_moment', 'neutral', 'follow_up', ARRAY['good','pleasant','helpful'], 'Was there anything pleasant or helpful in your day?', 'free_text', 2, 'Positive protective-factor prompt.', 'positive_protective_factor', TRUE, NULL, 'gentle', NULL, NULL, NULL, NULL),

      ('lonely_spoke_someone', 'adaptive', 'social_connection', 'daily_contact', 'loneliness', 'follow_up', ARRAY['spoke','called','visited'], 'Did you get a chance to speak with someone today?', 'free_text', 1, 'Daily social-contact assessment.', 'social_connection', TRUE, 0.600, 'gentle', 'lonely_contact_helpful', 'lonely_companionship', 'neutral_daily_engagement', NULL),
      ('lonely_contact_helpful', 'adaptive', 'protective_factor', 'helpful_contact', 'loneliness', 'follow_up', ARRAY['better','supported','contact'], 'Did any contact with another person help you feel supported today?', 'free_text', 2, 'Social protective-factor assessment.', 'positive_protective_factor', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),
      ('lonely_companionship', 'adaptive', 'social_connection', 'companionship', 'loneliness', 'follow_up', ARRAY['company','connected','alone'], 'Have you felt that you had enough company today?', 'free_text', 2, 'Perceived companionship assessment.', 'social_connection', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('lonely_daily_engagement', 'adaptive', 'daily_life', 'engagement', 'loneliness', 'follow_up', ARRAY['busy','occupied','activity'], 'Was there anything today that helped you feel involved or connected?', 'free_text', 3, 'Daily engagement and connection assessment.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),

      ('sad_energy_today', 'adaptive', 'daily_life', 'energy', 'sadness', 'follow_up', ARRAY['energy','tired','motivation'], 'How easy or difficult was it to get started with your day?', 'free_text', 1, 'Energy and motivation observation; not a diagnostic score.', 'energy_motivation', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_energy_today', NULL),
      ('sad_usual_interest', 'adaptive', 'daily_life', 'interest', 'sadness', 'follow_up', ARRAY['interest','enjoy','usual'], 'Did any of your usual activities feel enjoyable today?', 'free_text', 2, 'Daily engagement observation; not a diagnostic score.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_usual_interest', NULL),
      ('sad_supportive_moment', 'adaptive', 'protective_factor', 'support', 'sadness', 'follow_up', ARRAY['comfort','support','better'], 'Was there anything that brought you a little comfort today?', 'free_text', 2, 'Positive protective-factor assessment.', 'positive_protective_factor', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),
      ('sad_daily_engagement', 'adaptive', 'daily_life', 'routine', 'sadness', 'follow_up', ARRAY['routine','task','today'], 'How did your usual daily tasks feel today?', 'free_text', 3, 'Daily engagement assessment.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),

      ('anxious_relax_today', 'adaptive', 'emotional_check_in', 'calmness', 'anxiety', 'follow_up', ARRAY['relax','calm','settled'], 'Were there any times today when you felt calm or settled?', 'free_text', 1, 'Calmness and protective-factor assessment.', 'worry_calmness', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),
      ('anxious_daily_tasks', 'adaptive', 'daily_life', 'worry_impact', 'anxiety', 'follow_up', ARRAY['worry','task','focus'], 'Did worry make any of your usual tasks harder today?', 'free_text', 2, 'Non-diagnostic daily engagement assessment.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('anxious_supportive_factor', 'adaptive', 'protective_factor', 'reassurance', 'anxiety', 'follow_up', ARRAY['helped','reassured','support'], 'Did anything help you feel more at ease today?', 'free_text', 2, 'Protective-factor assessment.', 'positive_protective_factor', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),

      ('anger_calm_period', 'adaptive', 'emotional_check_in', 'calmness', 'anger', 'follow_up', ARRAY['calm','settled','eased'], 'Did the frustration ease at any point today?', 'free_text', 1, 'Clarification and calmness assessment.', 'worry_calmness', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),
      ('anger_daily_engagement', 'adaptive', 'daily_life', 'frustration_impact', 'anger', 'follow_up', ARRAY['frustration','task','activity'], 'Did the frustration affect what you wanted to do today?', 'free_text', 2, 'Daily engagement assessment.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('anger_supportive_factor', 'adaptive', 'protective_factor', 'support', 'anger', 'follow_up', ARRAY['helped','support','better'], 'Was there anything or anyone that helped the situation feel better?', 'free_text', 2, 'Protective-factor assessment.', 'positive_protective_factor', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),

      ('happy_daily_engagement', 'adaptive', 'daily_life', 'enjoyment', 'happiness', 'follow_up', ARRAY['enjoyed','activity','today'], 'What did you most enjoy doing today?', 'free_text', 1, 'Positive daily engagement assessment.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('happy_energy_today', 'adaptive', 'daily_life', 'energy', 'happiness', 'follow_up', ARRAY['energy','active','motivated'], 'How did your energy help you with your day?', 'free_text', 2, 'Positive energy assessment.', 'energy_motivation', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_energy_today', NULL),
      ('happy_social_connection', 'adaptive', 'social_connection', 'shared_positive', 'happiness', 'follow_up', ARRAY['shared','someone','together'], 'Did you share a good moment with anyone today?', 'free_text', 2, 'Positive social-connection assessment.', 'social_connection', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),

      ('cognitive_concentration_today', 'adaptive', 'cognitive_support', 'concentration', 'cognitive_fog', 'follow_up', ARRAY['focus','concentrate','attention'], 'How easy or difficult was it to concentrate today?', 'free_text', 1, 'Self-reported concentration; not a cognitive test.', 'memory_concentration', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('cognitive_daily_tasks', 'adaptive', 'daily_life', 'task_clarity', 'cognitive_fog', 'follow_up', ARRAY['task','steps','routine'], 'Did your usual daily tasks feel clear or confusing today?', 'free_text', 1, 'Daily task clarity observation; not a cognitive test.', 'daily_engagement', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_daily_engagement', NULL),
      ('cognitive_clear_period', 'adaptive', 'protective_factor', 'clear_period', 'cognitive_fog', 'follow_up', ARRAY['clear','focused','better'], 'Was there a time today when your thinking felt clearer?', 'free_text', 2, 'Protective-factor and clarification assessment.', 'positive_protective_factor', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_positive_moment', NULL),
      ('cognitive_engagement_today', 'adaptive', 'daily_life', 'mental_engagement', 'cognitive_fog', 'follow_up', ARRAY['read','conversation','task'], 'Was there an activity or conversation that held your attention today?', 'free_text', 2, 'Daily cognitive engagement observation; not a cognitive test.', 'memory_concentration', TRUE, 0.600, 'gentle', NULL, NULL, 'neutral_usual_interest', NULL)
    ON CONFLICT (question_code) DO UPDATE SET
      assessment_dimension = EXCLUDED.assessment_dimension,
      is_assessment = EXCLUDED.is_assessment,
      min_confidence = EXCLUDED.min_confidence,
      difficulty = EXCLUDED.difficulty,
      positive_next_code = EXCLUDED.positive_next_code,
      negative_next_code = EXCLUDED.negative_next_code,
      neutral_next_code = EXCLUDED.neutral_next_code,
      followup_next_code = EXCLUDED.followup_next_code;

    ALTER TABLE adaptive_question_bank
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_assessment_dimension_check,
      ADD CONSTRAINT adaptive_question_bank_assessment_dimension_check CHECK (
        assessment_dimension IS NULL OR assessment_dimension IN (
          'general_wellbeing', 'social_connection', 'energy_motivation',
          'daily_engagement', 'worry_calmness', 'memory_concentration',
          'positive_protective_factor', 'clarification'
        )
      ),
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_min_confidence_check,
      ADD CONSTRAINT adaptive_question_bank_min_confidence_check CHECK (
        min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)
      );

    ALTER TABLE adaptive_chat_turns
      DROP CONSTRAINT IF EXISTS adaptive_chat_turns_question_number_check,
      ADD CONSTRAINT adaptive_chat_turns_question_number_check CHECK (
        question_number IS NULL OR question_number BETWEEN 1 AND 5
      );

    CREATE INDEX IF NOT EXISTS adaptive_question_bank_assessment_candidates_idx
      ON adaptive_question_bank (target_state, assessment_dimension, priority, question_id)
      WHERE is_active = TRUE AND is_assessment = TRUE;
    CREATE INDEX IF NOT EXISTS adaptive_question_bank_positive_next_idx
      ON adaptive_question_bank (positive_next_code) WHERE positive_next_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS adaptive_question_bank_negative_next_idx
      ON adaptive_question_bank (negative_next_code) WHERE negative_next_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS adaptive_question_bank_neutral_next_idx
      ON adaptive_question_bank (neutral_next_code) WHERE neutral_next_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS adaptive_question_bank_followup_next_idx
      ON adaptive_question_bank (followup_next_code) WHERE followup_next_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS adaptive_chat_sessions_current_question_idx
      ON adaptive_chat_sessions (current_question_id) WHERE current_question_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS adaptive_chat_turns_session_question_number_uidx
      ON adaptive_chat_turns (session_id, question_number) WHERE question_number IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS adaptive_chat_turns_session_question_uidx
      ON adaptive_chat_turns (session_id, question_id) WHERE question_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS adaptive_chat_turns_session_question_uidx;
    DROP INDEX IF EXISTS adaptive_chat_turns_session_question_number_uidx;
    DROP INDEX IF EXISTS adaptive_chat_sessions_current_question_idx;
    DROP INDEX IF EXISTS adaptive_question_bank_followup_next_idx;
    DROP INDEX IF EXISTS adaptive_question_bank_neutral_next_idx;
    DROP INDEX IF EXISTS adaptive_question_bank_negative_next_idx;
    DROP INDEX IF EXISTS adaptive_question_bank_positive_next_idx;
    DROP INDEX IF EXISTS adaptive_question_bank_assessment_candidates_idx;

    DELETE FROM adaptive_question_bank WHERE question_code = ANY(ARRAY[${newQuestionCodes.map((code) => `'${code}'`).join(', ')}]::text[]);

    ALTER TABLE adaptive_chat_turns
      DROP CONSTRAINT IF EXISTS adaptive_chat_turns_question_number_check,
      DROP COLUMN IF EXISTS selection_metadata,
      DROP COLUMN IF EXISTS analysis_metadata,
      DROP COLUMN IF EXISTS model_version,
      DROP COLUMN IF EXISTS detection_source,
      DROP COLUMN IF EXISTS risk_indicator,
      DROP COLUMN IF EXISTS answer_polarity,
      DROP COLUMN IF EXISTS question_text,
      DROP COLUMN IF EXISTS question_code,
      DROP COLUMN IF EXISTS question_number;

    ALTER TABLE adaptive_chat_sessions
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS caregiver_notification_required,
      DROP COLUMN IF EXISTS recommended_activity,
      DROP COLUMN IF EXISTS conversation_engagement,
      DROP COLUMN IF EXISTS final_confidence,
      DROP COLUMN IF EXISTS current_question_id;

    ALTER TABLE adaptive_question_bank
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_min_confidence_check,
      DROP CONSTRAINT IF EXISTS adaptive_question_bank_assessment_dimension_check,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS min_confidence,
      DROP COLUMN IF EXISTS is_assessment,
      DROP COLUMN IF EXISTS assessment_dimension,
      DROP COLUMN IF EXISTS followup_next_code,
      DROP COLUMN IF EXISTS neutral_next_code,
      DROP COLUMN IF EXISTS negative_next_code,
      DROP COLUMN IF EXISTS positive_next_code;
  `);
};
