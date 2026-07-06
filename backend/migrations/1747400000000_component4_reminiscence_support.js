/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  pgm.sql(`
    -- Adaptive question bank for Component 4.
    -- The next question is selected from prior answers and current target state.
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
  `);

  pgm.createTable(
    'reminiscence_prompts',
    {
      prompt_id: 'id',
      prompt_code: { type: 'varchar(80)', notNull: true, unique: true },
      title: { type: 'varchar(150)', notNull: true },
      image_storage_url: { type: 'text' },
      prompt_text: { type: 'text', notNull: true },
      category: { type: 'varchar(80)' },
      historical_era: { type: 'varchar(100)' },
      is_active: { type: 'boolean', default: true },
      created_at: { type: 'timestamp', default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'mood_checkins',
    {
      checkin_id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      mood_label: { type: 'varchar(30)', notNull: true },
      mood_score: {
        type: 'integer',
        notNull: true,
        check: 'mood_score BETWEEN 1 AND 5',
      },
      reflection_text: { type: 'text' },
      input_mode: { type: 'varchar(20)', default: 'manual' },
      logged_at: { type: 'timestamp', default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'narrative_logs',
    {
      interaction_id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      prompt_id: {
        type: 'integer',
        references: '"reminiscence_prompts"(prompt_id)',
      },
      transcribed_narrative: { type: 'text', notNull: true },
      detected_emotional_state: { type: 'varchar(50)', notNull: true },
      confidence_score: { type: 'numeric(5,2)' },
      risk_level: { type: 'varchar(20)' },
      support_activity_key: { type: 'varchar(100)' },
      caregiver_notification_required: { type: 'boolean', default: false },
      support_directive: { type: 'jsonb' },
      logged_at: { type: 'timestamp', default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'support_activities',
    {
      activity_id: 'id',
      activity_key: { type: 'varchar(100)', notNull: true, unique: true },
      activity_title: { type: 'varchar(150)', notNull: true },
      activity_type: { type: 'varchar(80)', notNull: true },
      target_emotion: { type: 'varchar(50)', notNull: true },
      instruction_text: { type: 'text', notNull: true },
      is_active: { type: 'boolean', default: true },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'emotional_caregiver_alerts',
    {
      alert_id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      alert_type: { type: 'varchar(80)', notNull: true },
      alert_message: { type: 'text', notNull: true },
      trigger_reason: { type: 'text' },
      severity: { type: 'varchar(20)', default: 'medium' },
      is_acknowledged: { type: 'boolean', default: false },
      created_at: { type: 'timestamp', default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('mood_checkins', ['user_id', { name: 'logged_at', sort: 'DESC' }], {
    name: 'mood_checkins_user_logged_idx',
    ifNotExists: true,
  });

  pgm.createIndex('narrative_logs', ['user_id', { name: 'logged_at', sort: 'DESC' }], {
    name: 'narrative_logs_user_logged_idx',
    ifNotExists: true,
  });

  pgm.createIndex('narrative_logs', ['detected_emotional_state'], {
    name: 'narrative_logs_emotional_state_idx',
    ifNotExists: true,
  });

  pgm.createIndex('emotional_caregiver_alerts', ['user_id', { name: 'created_at', sort: 'DESC' }], {
    name: 'emotional_caregiver_alerts_user_created_idx',
    ifNotExists: true,
  });

  pgm.createIndex('reminiscence_prompts', ['prompt_code'], {
    name: 'reminiscence_prompts_code_idx',
    ifNotExists: true,
  });

  pgm.sql(`
    INSERT INTO reminiscence_prompts (
      prompt_code,
      title,
      image_storage_url,
      prompt_text,
      category,
      historical_era
    ) VALUES
      (
        'old_radio_childhood_songs',
        'Old Radio and Childhood Songs',
        NULL,
        'Think about a song or radio program you enjoyed when you were younger. What do you remember about that moment?',
        'music_memory',
        'childhood'
      ),
      (
        'family_meal_memory',
        'Family Meal Memory',
        NULL,
        'Can you remember a family meal that felt special to you? Who was there, and what food do you remember?',
        'family_memory',
        'daily_life'
      ),
      (
        'avurudu_festival_memory',
        'Avurudu Festival Memory',
        NULL,
        'Tell me about an Avurudu celebration you remember. What games, food, music, or family moments come to mind?',
        'cultural_memory',
        'festival'
      ),
      (
        'school_days_memory',
        'School Days Memory',
        NULL,
        'What is one memory from your school days that still stays with you?',
        'school_memory',
        'youth'
      ),
      (
        'old_workplace_proud_skill',
        'Workplace or Proud Skill Memory',
        NULL,
        'Think about work you did or a skill you were proud of. What made you feel capable or respected?',
        'proud_skill_memory',
        'adulthood'
      )
    ON CONFLICT (prompt_code) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO support_activities (
      activity_key,
      activity_title,
      activity_type,
      target_emotion,
      instruction_text
    ) VALUES
      (
        'sensory_breathing_guide',
        'Sensory Breathing Guide',
        'breathing_guidance',
        'anxiety',
        'Guide the elder through slow breathing while naming one thing they can see, hear, and feel around them.'
      ),
      (
        'memory_puzzle',
        'Gentle Memory Puzzle',
        'cognitive_activity',
        'cognitive_fog',
        'Offer a simple memory matching or sequence activity using familiar daily objects and encouraging language.'
      ),
      (
        'relaxing_music',
        'Relaxing Music Moment',
        'music_support',
        'sadness',
        'Suggest soft familiar music and invite the elder to rest quietly or share what the song reminds them of.'
      ),
      (
        'conversation_prompt',
        'Warm Conversation Prompt',
        'conversation_support',
        'loneliness',
        'Ask a gentle follow-up question about family, friends, or a meaningful memory to encourage connection.'
      ),
      (
        'positive_journal',
        'Positive Journal Reflection',
        'journaling',
        'happiness',
        'Invite the elder to record one good memory, person, or activity from today that made them feel positive.'
      ),
      (
        'standard_menu',
        'Standard Support Menu',
        'general_support',
        'neutral',
        'Show a simple menu of optional activities such as music, memory prompt, breathing, or journaling.'
      )
    ON CONFLICT (activity_key) DO NOTHING;
  `);

  pgm.sql(`
    -- Adaptive question bank seed data.
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
      ('open_day_so_far', 'opening', 'emotional_check_in', 'daily_opening', 'neutral', 'opening', ARRAY['day', 'today', 'morning'], 'How has your day been so far?', 'free_text', 1, 'Construct mapping inspired by general mood opening items. Not a diagnostic tool.'),
      ('open_share_day', 'opening', 'emotional_check_in', 'daily_opening', 'neutral', 'opening', ARRAY['share', 'day', 'talk'], 'Would you like to share something about your day?', 'free_text', 1, 'Construct mapping inspired by general mood opening items. Not a diagnostic tool.'),
      ('open_memory_moment', 'opening', 'emotional_check_in', 'memory_opening', 'mental_stimulation', 'opening', ARRAY['memory', 'moment', 'came to mind'], 'What memory or moment came to your mind today?', 'free_text', 2, 'Construct mapping inspired by reminiscence warm-up prompts.'),
      ('open_smile_today', 'opening', 'emotional_check_in', 'positive_opening', 'happiness', 'opening', ARRAY['smile', 'happy', 'good'], 'Did anything make you smile today?', 'yes_no', 2, 'Construct mapping inspired by positive affect indicators.'),
      ('open_old_memory', 'opening', 'emotional_check_in', 'reminiscence_opening', 'memory', 'opening', ARRAY['old memory', 'past', 'remember'], 'Would you like to talk about an old memory today?', 'free_text', 2, 'Construct mapping inspired by reminiscence-based engagement.'),
      ('open_company_today', 'opening', 'social_opening', 'connection', 'loneliness', 'opening', ARRAY['company', 'together', 'alone'], 'Would you like some company while we talk today?', 'yes_no', 2, 'Construct mapping inspired by social connection support.'),
      ('open_calm_moment', 'opening', 'emotional_check_in', 'calm_opening', 'anxiety', 'opening', ARRAY['calm', 'quiet', 'peaceful'], 'Would you like a calm moment to begin with?', 'yes_no', 2, 'Construct mapping inspired by calming support cues.'),
      ('open_small_activity', 'opening', 'cognitive_support', 'gentle_start', 'mental_stimulation', 'activity_offer', ARRAY['activity', 'help', 'something to do'], 'Would a small activity help you begin?', 'yes_no', 3, 'Construct mapping inspired by engagement and cognitive reserve support.'),

      ('lonely_miss_someone', 'adaptive', 'emotional_sharing', 'connection', 'loneliness', 'follow_up', ARRAY['miss', 'someone', 'family'], 'Would you like to talk about someone you miss today?', 'free_text', 1, 'Construct mapping inspired by social connection and loneliness-related items.'),
      ('lonely_quiet_house', 'adaptive', 'environmental_context', 'quiet_space', 'loneliness', 'follow_up', ARRAY['quiet', 'silent', 'alone'], 'Did the house feel quiet today?', 'yes_no', 1, 'Construct mapping inspired by perceived social isolation cues.'),
      ('lonely_family_friends_memory', 'adaptive', 'emotional_sharing', 'family_friends', 'loneliness', 'follow_up', ARRAY['family', 'friends', 'memory'], 'Would you like to share a memory about your family or friends?', 'free_text', 1, 'Construct mapping inspired by social reminiscence support.'),
      ('lonely_message_trusted_person', 'adaptive', 'social_connection', 'outreach', 'loneliness', 'activity_offer', ARRAY['message', 'trust', 'call'], 'Would you like to send a short message to someone you trust?', 'yes_no', 2, 'Construct mapping inspired by social participation and outreach.'),
      ('lonely_caregiver_checkin', 'adaptive', 'social_support', 'caregiver', 'loneliness', 'activity_offer', ARRAY['caregiver', 'check-in', 'connected'], 'Would a caregiver check-in help you feel more connected today?', 'yes_no', 2, 'Construct mapping inspired by caregiver-supported connection.'),
      ('lonely_visit_memory', 'adaptive', 'reminiscence', 'shared_visit', 'loneliness', 'follow_up', ARRAY['visit', 'together', 'shared'], 'Would you like to remember a visit or time you shared with someone?', 'free_text', 2, 'Construct mapping inspired by reminiscence and belonging.'),
      ('lonely_one_kind_voice', 'adaptive', 'emotional_sharing', 'comfort', 'loneliness', 'confirmation', ARRAY['voice', 'kind', 'comfort'], 'Would it help to hear one kind voice from someone familiar?', 'yes_no', 2, 'Construct mapping inspired by comfort-seeking and social reassurance.'),
      ('lonely_outside_visit', 'adaptive', 'connection_offer', 'gentle_social_step', 'loneliness', 'activity_offer', ARRAY['outside', 'walk', 'visit'], 'Would a short visit or a gentle walk feel helpful today?', 'yes_no', 3, 'Construct mapping inspired by small social participation steps.'),

      ('sad_share_difficult', 'adaptive', 'emotional_sharing', 'difficulty', 'sadness', 'follow_up', ARRAY['difficult', 'hard', 'heavy'], 'Would you like to share what made today feel difficult?', 'free_text', 1, 'Construct mapping inspired by low mood and supportive expression.'),
      ('sad_comforting_memory', 'adaptive', 'reminiscence', 'comfort_memory', 'sadness', 'follow_up', ARRAY['comforting memory', 'calm', 'memory'], 'Is there a comforting memory you would like to talk about?', 'free_text', 1, 'Construct mapping inspired by soothing reminiscence prompts.'),
      ('sad_music_help', 'adaptive', 'activity_offer', 'soothing_music', 'sadness', 'activity_offer', ARRAY['music', 'listen', 'song'], 'Would listening to calming music help right now?', 'yes_no', 2, 'Construct mapping inspired by mood-supportive sensory activity.'),
      ('sad_one_gentle_memory', 'adaptive', 'reminiscence', 'memory_journal', 'sadness', 'follow_up', ARRAY['write', 'speak', 'memory'], 'Would you like to write or speak one gentle memory?', 'free_text', 2, 'Construct mapping inspired by reflective emotional sharing.'),
      ('sad_small_activity_today', 'adaptive', 'positive_activation', 'small_pleasure', 'sadness', 'confirmation', ARRAY['small activity', 'enjoy', 'today'], 'Did you enjoy any small activity today?', 'yes_no', 2, 'Construct mapping inspired by positive activation and daily engagement.'),
      ('sad_rest_together', 'adaptive', 'supportive_pause', 'rest', 'sadness', 'activity_offer', ARRAY['rest', 'pause', 'slow'], 'Would it help to rest together for a moment?', 'yes_no', 3, 'Construct mapping inspired by gentle reassurance and pacing.'),
      ('sad_favorite_place_memory', 'adaptive', 'reminiscence', 'favorite_place', 'sadness', 'follow_up', ARRAY['place', 'remember', 'favorite'], 'Would you like to remember a favorite place that feels comforting?', 'free_text', 2, 'Construct mapping inspired by comforting memory recall.'),
      ('sad_kind_person_memory', 'adaptive', 'connection_memory', 'support_person', 'sadness', 'follow_up', ARRAY['person', 'kind', 'support'], 'Would you like to talk about a kind person from your life?', 'free_text', 2, 'Construct mapping inspired by supportive social memory.'),

      ('anxious_worried_today', 'adaptive', 'emotional_sharing', 'worry', 'anxiety', 'follow_up', ARRAY['worried', 'nervous', 'stress'], 'Did anything make you feel worried today?', 'free_text', 1, 'Construct mapping inspired by worry-related mood cues.'),
      ('anxious_breathing_help', 'adaptive', 'calming_support', 'breathing', 'anxiety', 'activity_offer', ARRAY['breathing', 'calm', 'slow'], 'Would a short breathing activity help you feel calmer?', 'yes_no', 1, 'Construct mapping inspired by calming regulation support.'),
      ('anxious_small_step', 'adaptive', 'support_planning', 'step_by_step', 'anxiety', 'activity_offer', ARRAY['step', 'together', 'small'], 'Would you like to take one small step together?', 'yes_no', 2, 'Construct mapping inspired by guided coping and pacing.'),
      ('anxious_calm_breathing_guide', 'adaptive', 'calming_support', 'breathing_guide', 'anxiety', 'activity_offer', ARRAY['quiet', 'breathing', 'guide'], 'Do you want to sit quietly and follow a calm breathing guide?', 'yes_no', 2, 'Construct mapping inspired by grounding and relaxation support.'),
      ('anxious_more_stressful_day', 'adaptive', 'emotional_sharing', 'stress_level', 'anxiety', 'confirmation', ARRAY['stressful', 'usual', 'day'], 'Did your day feel more stressful than usual?', 'yes_no', 2, 'Construct mapping inspired by stress appraisal items.'),
      ('anxious_grounding_observe', 'adaptive', 'activity_offer', 'grounding', 'anxiety', 'activity_offer', ARRAY['see', 'hear', 'feel'], 'Would you like to name one thing you can see, hear, and feel right now?', 'yes_no', 2, 'Construct mapping inspired by simple grounding practice.'),
      ('anxious_plan_with_support', 'adaptive', 'support_planning', 'guided_step', 'anxiety', 'follow_up', ARRAY['plan', 'support', 'next'], 'Would it help to plan the next small step with support?', 'yes_no', 3, 'Construct mapping inspired by executive support and calming planning.'),
      ('anxious_safe_place_memory', 'adaptive', 'reminiscence', 'safe_place', 'anxiety', 'follow_up', ARRAY['safe place', 'calm', 'memory'], 'Would you like to think about a safe and peaceful place?', 'free_text', 2, 'Construct mapping inspired by calming reminiscence support.'),

      ('happy_save_memory', 'adaptive', 'positive_affect', 'memory_saving', 'happiness', 'confirmation', ARRAY['happy', 'memory', 'save'], 'That sounds lovely. Would you like to save this happy memory?', 'yes_no', 1, 'Construct mapping inspired by positive reinforcement and memory saving.'),
      ('happy_special_memory', 'adaptive', 'positive_affect', 'meaning', 'happiness', 'follow_up', ARRAY['special', 'what made', 'memory'], 'What made this memory special to you?', 'free_text', 1, 'Construct mapping inspired by positive autobiographical memory.'),
      ('happy_share_caregiver', 'adaptive', 'social_sharing', 'caregiver', 'happiness', 'activity_offer', ARRAY['share', 'caregiver', 'positive'], 'Would you like to share this positive memory with your caregiver?', 'yes_no', 2, 'Construct mapping inspired by social sharing of positive affect.'),
      ('happy_memory_journal', 'adaptive', 'activity_offer', 'journaling', 'happiness', 'activity_offer', ARRAY['journal', 'add', 'memory'], 'Would you like to add this to your memory journal?', 'yes_no', 2, 'Construct mapping inspired by reflective journaling and enrichment.'),
      ('happy_feel_encouraged', 'adaptive', 'positive_affect', 'encouragement', 'happiness', 'confirmation', ARRAY['encouraged', 'today', 'good'], 'Did this memory make you feel encouraged today?', 'yes_no', 2, 'Construct mapping inspired by positive reinforcement and well-being.'),
      ('happy_share_with_family', 'adaptive', 'social_sharing', 'family', 'happiness', 'activity_offer', ARRAY['family', 'share', 'joy'], 'Would you like to share this joy with someone close to you?', 'yes_no', 2, 'Construct mapping inspired by positive social participation.'),
      ('happy_repeat_good_moment', 'adaptive', 'reminiscence', 'good_moment', 'happiness', 'follow_up', ARRAY['good moment', 'pleasant', 'remember'], 'Would you like to tell me one more good moment from today?', 'free_text', 2, 'Construct mapping inspired by positive recall practice.'),
      ('happy_keep_moment', 'adaptive', 'positive_affect', 'preserve', 'happiness', 'confirmation', ARRAY['keep', 'remember', 'special'], 'Would you like to keep this moment in mind for later?', 'yes_no', 3, 'Construct mapping inspired by savoring and retention of positive moments.'),

      ('anger_take_pause', 'adaptive', 'de_escalation', 'pause', 'anger', 'activity_offer', ARRAY['pause', 'continue', 'calm'], 'Would you like to take a calm pause before continuing?', 'yes_no', 1, 'Construct mapping inspired by emotional pacing and de-escalation.'),
      ('anger_frustrating_today', 'adaptive', 'emotional_sharing', 'frustration', 'anger', 'follow_up', ARRAY['frustrating', 'annoying', 'upset'], 'Did something make today feel frustrating?', 'free_text', 1, 'Construct mapping inspired by frustration expression.'),
      ('anger_quiet_breathing', 'adaptive', 'calming_support', 'breathing', 'anger', 'activity_offer', ARRAY['quiet', 'breathing', 'help'], 'Would a quiet breathing activity help?', 'yes_no', 1, 'Construct mapping inspired by calming regulation support.'),
      ('anger_talk_slowly', 'adaptive', 'supportive_dialogue', 'paced_talk', 'anger', 'confirmation', ARRAY['talk', 'slowly', 'it'], 'Would you like to talk about it slowly?', 'yes_no', 2, 'Construct mapping inspired by slow supportive conversation.'),
      ('anger_calm_activity_now', 'adaptive', 'activity_offer', 'calming_activity', 'anger', 'activity_offer', ARRAY['activity', 'now', 'calm'], 'Should we try a calming activity now?', 'yes_no', 2, 'Construct mapping inspired by immediate calming support.'),
      ('anger_soft_space', 'adaptive', 'environmental_context', 'quiet_space', 'anger', 'confirmation', ARRAY['quiet', 'space', 'settle'], 'Would a quiet space help you settle a little?', 'yes_no', 2, 'Construct mapping inspired by reducing stimulation.'),
      ('anger_hands_rest', 'adaptive', 'somatic_calm', 'rest', 'anger', 'activity_offer', ARRAY['hands', 'rest', 'gentle'], 'Would resting your hands and shoulders feel helpful?', 'yes_no', 3, 'Construct mapping inspired by simple body relaxation.'),
      ('anger_kind_memory', 'adaptive', 'reminiscence', 'kindness_memory', 'anger', 'follow_up', ARRAY['kind', 'memory', 'respect'], 'Would it help to remember a kind moment from earlier?', 'free_text', 3, 'Construct mapping inspired by calming reminiscence.'),

      ('memory_simple_activity', 'adaptive', 'cognitive_support', 'memory_practice', 'memory', 'activity_offer', ARRAY['memory', 'activity', 'simple'], 'Would you like to try one simple memory activity?', 'yes_no', 1, 'Construct mapping inspired by recall and engagement tasks.'),
      ('memory_misplaced_item', 'adaptive', 'everyday_recall', 'object_search', 'memory', 'follow_up', ARRAY['misplace', 'lost', 'important'], 'Did you misplace anything important today?', 'yes_no', 1, 'Construct mapping inspired by daily recall and object tracking.'),
      ('memory_picture_help', 'adaptive', 'cognitive_support', 'visual_cue', 'memory', 'activity_offer', ARRAY['picture', 'remember', 'help'], 'Would looking at a picture help you remember more easily?', 'yes_no', 1, 'Construct mapping inspired by cue-based recall support.'),
      ('memory_morning_task', 'adaptive', 'routine_recall', 'morning', 'memory', 'follow_up', ARRAY['morning', 'today', 'did'], 'Would you like to recall one thing you did this morning?', 'free_text', 2, 'Construct mapping inspired by routine recall and orientation.'),
      ('memory_routine_reminder', 'adaptive', 'cognitive_support', 'routine', 'memory', 'activity_offer', ARRAY['routine', 'reminder', 'today'], 'Would a simple reminder of today''s routine help?', 'yes_no', 2, 'Construct mapping inspired by daily routine recall.'),
      ('memory_name_first_step', 'adaptive', 'executive_support', 'sequencing', 'memory', 'follow_up', ARRAY['first step', 'do', 'task'], 'Can you name the first step of a familiar task?', 'free_text', 2, 'Construct mapping inspired by sequencing and practical recall.'),
      ('memory_favorite_object', 'adaptive', 'reminiscence', 'familiar_object', 'memory', 'follow_up', ARRAY['object', 'familiar', 'memory'], 'Would you like to recall a familiar object from your home or past?', 'free_text', 3, 'Construct mapping inspired by autobiographical cueing.'),
      ('memory_today_anchor', 'adaptive', 'orientation', 'day_anchor', 'memory', 'confirmation', ARRAY['today', 'what', 'did'], 'Would it help to anchor the day by recalling one thing you did today?', 'yes_no', 3, 'Construct mapping inspired by simple orientation support.'),

      ('focus_conversation_today', 'adaptive', 'attention', 'conversation_focus', 'attention', 'confirmation', ARRAY['focus', 'conversation', 'today'], 'Was it easy to focus on conversations today?', 'yes_no', 1, 'Construct mapping inspired by attention and concentration cues.'),
      ('focus_noise_today', 'adaptive', 'attention', 'distraction', 'attention', 'confirmation', ARRAY['noise', 'harder', 'think'], 'Did outside noise make it harder to think clearly?', 'yes_no', 1, 'Construct mapping inspired by distraction sensitivity.'),
      ('focus_short_activity', 'adaptive', 'attention', 'practice', 'attention', 'activity_offer', ARRAY['short', 'focus', 'activity'], 'Would you like to try one short focus activity?', 'yes_no', 1, 'Construct mapping inspired by brief attention practice.'),
      ('focus_small_task_done', 'adaptive', 'achievement', 'task_completion', 'attention', 'confirmation', ARRAY['finish', 'small task', 'today'], 'Did you finish a small task today?', 'yes_no', 2, 'Construct mapping inspired by attention sustaining and task completion.'),
      ('focus_quiet_activity', 'adaptive', 'attention', 'low_distraction', 'attention', 'activity_offer', ARRAY['quiet', 'concentrate', 'help'], 'Would a quiet activity help you concentrate?', 'yes_no', 2, 'Construct mapping inspired by distraction reduction.'),
      ('focus_picture_sort', 'adaptive', 'attention', 'sorting', 'attention', 'activity_offer', ARRAY['picture', 'sort', 'match'], 'Would you like to sort a few picture cards or objects?', 'yes_no', 2, 'Construct mapping inspired by selective attention and sorting.'),
      ('focus_listen_and_repeat', 'adaptive', 'attention', 'repeat', 'attention', 'follow_up', ARRAY['listen', 'repeat', 'say'], 'Would you like to listen and repeat a short phrase?', 'yes_no', 3, 'Construct mapping inspired by simple focus rehearsal.'),
      ('focus_stay_with_me', 'adaptive', 'attention', 'sustained', 'attention', 'confirmation', ARRAY['stay', 'with me', 'focus'], 'Would it help to stay with one topic for a moment?', 'yes_no', 3, 'Construct mapping inspired by sustained attention support.'),

      ('exec_small_decisions', 'adaptive', 'executive_function', 'decision_making', 'executive_function', 'confirmation', ARRAY['decisions', 'today', 'small'], 'Was it easy to make small daily decisions today?', 'yes_no', 1, 'Construct mapping inspired by everyday decision-making.'),
      ('exec_organized_today', 'adaptive', 'executive_function', 'organization', 'executive_function', 'confirmation', ARRAY['organized', 'medicine', 'clothes', 'meals'], 'Did you organize anything today, such as medicine, clothes, or meals?', 'yes_no', 1, 'Construct mapping inspired by daily organization and planning.'),
      ('exec_step_by_step_help', 'adaptive', 'executive_function', 'sequencing', 'executive_function', 'activity_offer', ARRAY['step by step', 'reminder', 'help'], 'Would a simple step-by-step reminder help?', 'yes_no', 1, 'Construct mapping inspired by guided sequencing support.'),
      ('exec_household_task', 'adaptive', 'executive_function', 'task_completion', 'executive_function', 'confirmation', ARRAY['household', 'task', 'complete'], 'Did you complete a household task today?', 'yes_no', 2, 'Construct mapping inspired by task initiation and completion.'),
      ('exec_plan_one_task', 'adaptive', 'executive_function', 'planning', 'executive_function', 'activity_offer', ARRAY['plan', 'task', 'help'], 'Would you like help planning one small task?', 'yes_no', 2, 'Construct mapping inspired by planning and self-organization.'),
      ('exec_choose_between_two', 'adaptive', 'executive_function', 'choice', 'executive_function', 'follow_up', ARRAY['choose', 'two', 'decide'], 'Would it help to choose between two simple options?', 'yes_no', 2, 'Construct mapping inspired by simple decision scaffolding.'),
      ('exec_sort_today_steps', 'adaptive', 'executive_function', 'sequencing', 'executive_function', 'follow_up', ARRAY['order', 'steps', 'next'], 'Would you like to put today''s steps in order together?', 'yes_no', 3, 'Construct mapping inspired by sequencing and planning support.'),
      ('exec_checklist_help', 'adaptive', 'executive_function', 'checklist', 'executive_function', 'activity_offer', ARRAY['checklist', 'remember', 'help'], 'Would a short checklist help you keep track today?', 'yes_no', 3, 'Construct mapping inspired by external support for organization.'),

      ('stim_read_puzzle_cards', 'adaptive', 'cognitive_reserve', 'leisure_activity', 'mental_stimulation', 'activity_offer', ARRAY['reading', 'puzzles', 'cards'], 'Did you do any mental activity today, like reading, puzzles, or cards?', 'yes_no', 1, 'Construct mapping inspired by cognitive reserve and leisure activity.'),
      ('stim_picture_question', 'adaptive', 'cognitive_reserve', 'simple_game', 'mental_stimulation', 'activity_offer', ARRAY['picture', 'question', 'try'], 'Would you like to try a simple picture question?', 'yes_no', 1, 'Construct mapping inspired by light cognitive engagement.'),
      ('stim_learn_something', 'adaptive', 'cognitive_reserve', 'learning', 'mental_stimulation', 'follow_up', ARRAY['learn', 'interesting', 'today'], 'Did you learn or hear something interesting today?', 'free_text', 1, 'Construct mapping inspired by lifelong learning and reserve.'),
      ('stim_song_memory', 'adaptive', 'cognitive_reserve', 'music_recall', 'mental_stimulation', 'activity_offer', ARRAY['song', 'memory', 'listen'], 'Would you like to listen to a favorite song and recall a memory?', 'yes_no', 2, 'Construct mapping inspired by music-assisted reminiscence.'),
      ('stim_memory_journal', 'adaptive', 'cognitive_reserve', 'journaling', 'mental_stimulation', 'activity_offer', ARRAY['write', 'speak', 'journal'], 'Would you like to write or speak a short memory journal entry?', 'yes_no', 2, 'Construct mapping inspired by reflective journaling and cognitive reserve.'),
      ('stim_story_from_photo', 'adaptive', 'cognitive_reserve', 'photo_story', 'mental_stimulation', 'follow_up', ARRAY['photo', 'story', 'picture'], 'Would you like to tell a short story from a photo or object?', 'free_text', 2, 'Construct mapping inspired by narrative recall and enrichment.'),
      ('stim_favorite_game', 'adaptive', 'cognitive_reserve', 'game_recall', 'mental_stimulation', 'follow_up', ARRAY['game', 'cards', 'puzzle'], 'Would you like to remember a favorite game or pastime?', 'free_text', 3, 'Construct mapping inspired by leisure activity and cognitive reserve.'),
      ('stim_new_small_fact', 'adaptive', 'cognitive_reserve', 'learning', 'mental_stimulation', 'confirmation', ARRAY['new', 'fact', 'interesting'], 'Would you like to hear one small interesting fact today?', 'yes_no', 3, 'Construct mapping inspired by novelty and cognitive stimulation.')
    ON CONFLICT (question_code) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('emotional_caregiver_alerts', { ifExists: true, cascade: true });
  pgm.dropTable('narrative_logs', { ifExists: true, cascade: true });
  pgm.dropTable('mood_checkins', { ifExists: true, cascade: true });
  pgm.dropTable('support_activities', { ifExists: true, cascade: true });
  pgm.dropTable('reminiscence_prompts', { ifExists: true, cascade: true });
};
