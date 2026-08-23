CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS emotional_support_response_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    emotion_category TEXT NOT NULL CHECK (emotion_category IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral')),
    response_type TEXT NOT NULL CHECK (response_type IN ('empathetic_reply', 'calming_support', 'motivation', 'escalation_hold', 'de_escalation')),
    target_risk_level TEXT CHECK (target_risk_level IN ('low', 'medium', 'high')),
    response_text TEXT NOT NULL,
    follow_up_prompt TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_es_response_bank_emotion_risk
    ON emotional_support_response_bank (emotion_category, target_risk_level, is_active);

CREATE OR REPLACE VIEW response_bank AS
SELECT
    id,
    emotion_category,
    response_type,
    target_risk_level,
    response_text,
    follow_up_prompt,
    is_active,
    created_at,
    updated_at
FROM emotional_support_response_bank;

CREATE TABLE IF NOT EXISTS emotional_support_elder_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id INTEGER NOT NULL,
    display_name TEXT,
    age INTEGER,
    gender TEXT,
    living_status TEXT CHECK (living_status IN ('alone', 'family', 'care_home')),
    baseline_mood TEXT CHECK (baseline_mood IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral')),
    cognitive_level TEXT CHECK (cognitive_level IN ('low', 'medium', 'high')),
    check_in_times TEXT[] DEFAULT ARRAY[]::TEXT[],
    voice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    chronic_conditions TEXT[] DEFAULT ARRAY[]::TEXT[],
    clinical_notes TEXT,
    caregiver_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_es_elder_profiles_elder_user
    ON emotional_support_elder_profiles (elder_user_id);

CREATE TABLE IF NOT EXISTS emotional_support_cognitive_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('memory', 'attention', 'orientation', 'breathing', 'reflection')),
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    target_emotions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    prompt TEXT NOT NULL,
    expected_answer_type TEXT NOT NULL CHECK (expected_answer_type IN ('text', 'choice', 'timer', 'none')),
    options JSONB NOT NULL DEFAULT '[]'::JSONB,
    estimated_duration_sec INTEGER NOT NULL DEFAULT 60,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emotional_support_emotion_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id INTEGER NOT NULL,
    input_mode TEXT NOT NULL CHECK (input_mode IN ('emoji', 'text', 'voice', 'multimodal')),
    check_in_type TEXT NOT NULL CHECK (check_in_type IN ('manual', 'scheduled', 'triggered')),
    emoji TEXT,
    raw_text TEXT,
    transcript TEXT,
    audio_url TEXT,
    sentiment_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    stress_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    loneliness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    detected_emotion TEXT NOT NULL CHECK (detected_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral')),
    emotion_probabilities JSONB NOT NULL DEFAULT '{}'::JSONB,
    context_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    intervention_id UUID,
    activity_id UUID,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    session_status TEXT NOT NULL DEFAULT 'completed' CHECK (session_status IN ('completed', 'abandoned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_es_sessions_elder_created
    ON emotional_support_emotion_sessions (elder_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS emotional_support_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES emotional_support_emotion_sessions(id) ON DELETE CASCADE,
    elder_user_id INTEGER NOT NULL,
    response_bank_id UUID REFERENCES emotional_support_response_bank(id) ON DELETE SET NULL,
    response_type TEXT NOT NULL CHECK (response_type IN ('empathetic_reply', 'calming_support', 'motivation', 'escalation_hold', 'de_escalation')),
    response_text TEXT NOT NULL,
    response_source TEXT NOT NULL CHECK (response_source IN ('template', 'llm', 'hybrid', 'response_bank')),
    trigger_emotion TEXT,
    trigger_risk_level TEXT,
    selected_because JSONB NOT NULL DEFAULT '[]'::JSONB,
    follow_up_prompt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES emotional_support_emotion_sessions(id) ON DELETE CASCADE,
    elder_user_id INTEGER NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('elder', 'system')),
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'voice_transcript', 'emoji', 'multimodal', 'response')),
    message_text TEXT NOT NULL,
    detected_emotion TEXT CHECK (detected_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral')),
    response_bank_id UUID REFERENCES emotional_support_response_bank(id) ON DELETE SET NULL,
    intervention_id UUID REFERENCES emotional_support_interventions(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_session_created
    ON chat_logs (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_chat_logs_elder_created
    ON chat_logs (elder_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS emotional_support_activity_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id INTEGER NOT NULL,
    session_id UUID NOT NULL REFERENCES emotional_support_emotion_sessions(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES emotional_support_cognitive_activities(id) ON DELETE CASCADE,
    answer_text TEXT,
    selected_option TEXT,
    score NUMERIC(6,2),
    completion_status TEXT NOT NULL CHECK (completion_status IN ('completed', 'skipped', 'timed_out')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_es_attempts_elder_started
    ON emotional_support_activity_attempts (elder_user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS emotional_support_caregiver_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id INTEGER NOT NULL,
    caregiver_user_id INTEGER NOT NULL,
    session_id UUID REFERENCES emotional_support_emotion_sessions(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('negative_mood_trend', 'high_stress', 'loneliness_pattern', 'missed_checkins')),
    severity TEXT NOT NULL CHECK (severity IN ('medium', 'high', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    explanation JSONB NOT NULL DEFAULT '{}'::JSONB,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_es_alerts_caregiver_status_created
    ON emotional_support_caregiver_alerts (caregiver_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS emotional_support_trend_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id INTEGER NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    dominant_emotion TEXT CHECK (dominant_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral')),
    emotion_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
    average_stress_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    average_loneliness_score NUMERIC(5,4) NOT NULL DEFAULT 0,
    check_in_completion_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    intervention_completion_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    alert_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_es_trends_elder_period
    ON emotional_support_trend_snapshots (elder_user_id, period_type, period_start DESC);

-- Adaptive question bank for Component 4.
-- Questions are selected dynamically based on the elder's previous answer.
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
    positive_next_code VARCHAR(80),
    negative_next_code VARCHAR(80),
    neutral_next_code VARCHAR(80),
    followup_next_code VARCHAR(80),
    assessment_dimension VARCHAR(50) CHECK (
        assessment_dimension IS NULL OR assessment_dimension IN (
            'general_wellbeing', 'social_connection', 'energy_motivation',
            'daily_engagement', 'worry_calmness', 'memory_concentration',
            'positive_protective_factor', 'clarification'
        )
    ),
    is_assessment BOOLEAN NOT NULL DEFAULT FALSE,
    min_confidence NUMERIC(4,3) CHECK (min_confidence IS NULL OR (min_confidence >= 0 AND min_confidence <= 1)),
    difficulty VARCHAR(30),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adaptive_question_bank_phase_priority_idx
    ON adaptive_question_bank (phase, priority, is_active);

CREATE INDEX IF NOT EXISTS adaptive_question_bank_target_state_idx
    ON adaptive_question_bank (target_state, is_active);

CREATE INDEX IF NOT EXISTS adaptive_question_bank_question_type_idx
    ON adaptive_question_bank (question_type, is_active);

CREATE TABLE IF NOT EXISTS adaptive_chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
    current_state VARCHAR(50),
    turn_count INTEGER DEFAULT 0,
    is_complete BOOLEAN DEFAULT FALSE,
    final_emotional_state VARCHAR(50),
    current_question_id INTEGER REFERENCES adaptive_question_bank(question_id) ON DELETE SET NULL,
    final_confidence NUMERIC(5,4),
    conversation_engagement VARCHAR(50),
    recommended_activity VARCHAR(80),
    caregiver_notification_required BOOLEAN NOT NULL DEFAULT FALSE,
    risk_level VARCHAR(20),
    support_directive JSONB,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS adaptive_chat_turns (
    turn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES adaptive_chat_sessions(session_id) ON DELETE CASCADE,
    question_id INTEGER REFERENCES adaptive_question_bank(question_id) ON DELETE SET NULL,
    user_answer TEXT,
    detected_state VARCHAR(50),
    confidence_score NUMERIC(5,2),
    question_number INTEGER CHECK (question_number IS NULL OR question_number BETWEEN 1 AND 5),
    question_code VARCHAR(80),
    question_text TEXT,
    answer_polarity VARCHAR(20),
    risk_indicator VARCHAR(20),
    detection_source VARCHAR(50),
    model_version VARCHAR(80),
    analysis_metadata JSONB,
    selection_metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adaptive_chat_sessions_user_created_idx
    ON adaptive_chat_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS adaptive_chat_sessions_complete_idx
    ON adaptive_chat_sessions (is_complete, updated_at DESC);

CREATE INDEX IF NOT EXISTS adaptive_chat_turns_session_created_idx
    ON adaptive_chat_turns (session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS adaptive_chat_turns_question_idx
    ON adaptive_chat_turns (question_id);

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

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_chat_turns_session_question_number_uidx
    ON adaptive_chat_turns (session_id, question_number) WHERE question_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_chat_turns_session_question_uidx
    ON adaptive_chat_turns (session_id, question_id) WHERE question_id IS NOT NULL;

ALTER TABLE emotional_support_response_bank
    DROP CONSTRAINT IF EXISTS emotional_support_response_bank_emotion_category_check;

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
)
SELECT *
FROM (
    VALUES
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
    ('memory_routine_reminder', 'adaptive', 'cognitive_support', 'routine', 'memory', 'activity_offer', ARRAY['routine', 'reminder', 'today'], 'Would a simple reminder of today's routine help?', 'yes_no', 2, 'Construct mapping inspired by daily routine recall.'),
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
    ('exec_sort_today_steps', 'adaptive', 'executive_function', 'sequencing', 'executive_function', 'follow_up', ARRAY['order', 'steps', 'next'], 'Would you like to put today's steps in order together?', 'yes_no', 3, 'Construct mapping inspired by sequencing and planning support.'),
    ('exec_checklist_help', 'adaptive', 'executive_function', 'checklist', 'executive_function', 'activity_offer', ARRAY['checklist', 'remember', 'help'], 'Would a short checklist help you keep track today?', 'yes_no', 3, 'Construct mapping inspired by external support for organization.'),

    ('stim_read_puzzle_cards', 'adaptive', 'cognitive_reserve', 'leisure_activity', 'mental_stimulation', 'activity_offer', ARRAY['reading', 'puzzles', 'cards'], 'Did you do any mental activity today, like reading, puzzles, or cards?', 'yes_no', 1, 'Construct mapping inspired by cognitive reserve and leisure activity.'),
    ('stim_picture_question', 'adaptive', 'cognitive_reserve', 'simple_game', 'mental_stimulation', 'activity_offer', ARRAY['picture', 'question', 'try'], 'Would you like to try a simple picture question?', 'yes_no', 1, 'Construct mapping inspired by light cognitive engagement.'),
    ('stim_learn_something', 'adaptive', 'cognitive_reserve', 'learning', 'mental_stimulation', 'follow_up', ARRAY['learn', 'interesting', 'today'], 'Did you learn or hear something interesting today?', 'free_text', 1, 'Construct mapping inspired by lifelong learning and reserve.'),
    ('stim_song_memory', 'adaptive', 'cognitive_reserve', 'music_recall', 'mental_stimulation', 'activity_offer', ARRAY['song', 'memory', 'listen'], 'Would you like to listen to a favorite song and recall a memory?', 'yes_no', 2, 'Construct mapping inspired by music-assisted reminiscence.'),
    ('stim_memory_journal', 'adaptive', 'cognitive_reserve', 'journaling', 'mental_stimulation', 'activity_offer', ARRAY['write', 'speak', 'journal'], 'Would you like to write or speak a short memory journal entry?', 'yes_no', 2, 'Construct mapping inspired by reflective journaling and cognitive reserve.'),
    ('stim_story_from_photo', 'adaptive', 'cognitive_reserve', 'photo_story', 'mental_stimulation', 'follow_up', ARRAY['photo', 'story', 'picture'], 'Would you like to tell a short story from a photo or object?', 'free_text', 2, 'Construct mapping inspired by narrative recall and enrichment.'),
    ('stim_favorite_game', 'adaptive', 'cognitive_reserve', 'game_recall', 'mental_stimulation', 'follow_up', ARRAY['game', 'cards', 'puzzle'], 'Would you like to remember a favorite game or pastime?', 'free_text', 3, 'Construct mapping inspired by leisure activity and cognitive reserve.'),
    ('stim_new_small_fact', 'adaptive', 'cognitive_reserve', 'learning', 'mental_stimulation', 'confirmation', ARRAY['new', 'fact', 'interesting'], 'Would you like to hear one small interesting fact today?', 'yes_no', 3, 'Construct mapping inspired by novelty and cognitive stimulation.')
) AS seed (
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
)
WHERE NOT EXISTS (
    SELECT 1
    FROM adaptive_question_bank existing
    WHERE existing.question_code = seed.question_code
);

INSERT INTO emotional_support_cognitive_activities (
    title,
    activity_type,
    difficulty,
    target_emotions,
    prompt,
    expected_answer_type,
    options,
    estimated_duration_sec
)
SELECT *
FROM (
    VALUES
    (
        'Happy Memory Reflection',
        'memory',
        'easy',
        ARRAY['happy'],
        'Share one happy memory from today or this week.',
        'text',
        '[]'::JSONB,
        90
    ),
    (
        'Comforting Memory',
        'memory',
        'easy',
        ARRAY['sad', 'lonely'],
        'Share one pleasant memory with a person, place, or song that comforted you.',
        'text',
        '[]'::JSONB,
        90
    ),
    (
        'Calm Place Memory',
        'memory',
        'easy',
        ARRAY['anxious'],
        'Think of a place where you felt calm. What did you see or hear there?',
        'text',
        '[]'::JSONB,
        90
    ),
    (
        'Familiar Routine Memory',
        'memory',
        'easy',
        ARRAY['confused', 'neutral'],
        'Name one familiar daily routine and describe the first step you usually do.',
        'text',
        '[]'::JSONB,
        75
    ),
    (
        'Respectful Moment Memory',
        'memory',
        'easy',
        ARRAY['angry'],
        'Recall a time when someone listened to you well. What helped you feel respected?',
        'text',
        '[]'::JSONB,
        90
    )
) AS seed (
    title,
    activity_type,
    difficulty,
    target_emotions,
    prompt,
    expected_answer_type,
    options,
    estimated_duration_sec
)
WHERE NOT EXISTS (
    SELECT 1
    FROM emotional_support_cognitive_activities existing
    WHERE existing.title = seed.title
);

INSERT INTO emotional_support_response_bank (
    emotion_category,
    response_type,
    target_risk_level,
    response_text,
    follow_up_prompt
)
SELECT *
FROM (
    VALUES
    (
        'happy',
        'motivation',
        'low',
        'It is good to hear some positive energy today. Let us build on that feeling.',
        'Would you like a short gratitude reflection?'
    ),
    (
        'neutral',
        'empathetic_reply',
        'low',
        'Thank you for telling me. A quiet or ordinary day is still worth checking in about. Let us do one simple activity together.',
        'Would you like to do a quick orientation check?'
    ),
    (
        'sad',
        'empathetic_reply',
        'medium',
        'It sounds like today feels difficult. We can slow down and focus on one gentle step together.',
        'Would you like to reflect on one comforting memory?'
    ),
    (
        'lonely',
        'empathetic_reply',
        'medium',
        'Feeling alone can be heavy. You are being heard right now, and we can take one supportive step together.',
        'Is there someone you would like to reach out to today?'
    ),
    (
        'anxious',
        'calming_support',
        'medium',
        'It sounds like you may be feeling worried. Let us slow the moment down and focus on one simple, familiar memory.',
        'Would you like to remember a place where you have felt calm before?'
    ),
    (
        'confused',
        'empathetic_reply',
        'medium',
        'Feeling unsure can be unsettling. We can take this one step at a time and use a familiar memory to help you feel oriented.',
        'Would you like to recall one familiar person, place, or routine?'
    ),
    (
        'angry',
        'de_escalation',
        'medium',
        'I can sense strong frustration right now. Let us pause and choose one steady memory before doing anything else.',
        'Would you like to think of a time when someone helped you feel respected or understood?'
    )
) AS seed (
    emotion_category,
    response_type,
    target_risk_level,
    response_text,
    follow_up_prompt
)
WHERE NOT EXISTS (
    SELECT 1
    FROM emotional_support_response_bank existing
    WHERE existing.emotion_category = seed.emotion_category
      AND existing.response_type = seed.response_type
      AND COALESCE(existing.target_risk_level, '') = COALESCE(seed.target_risk_level, '')
);

ALTER TABLE emotional_support_elder_profiles
    DROP CONSTRAINT IF EXISTS emotional_support_elder_profiles_baseline_mood_check;

UPDATE emotional_support_elder_profiles
SET baseline_mood = CASE baseline_mood
    WHEN 'stressed' THEN 'anxious'
    WHEN 'anger' THEN 'angry'
    ELSE baseline_mood
END
WHERE baseline_mood IN ('stressed', 'anger');

ALTER TABLE emotional_support_elder_profiles
    ADD CONSTRAINT emotional_support_elder_profiles_baseline_mood_check
        CHECK (baseline_mood IS NULL OR baseline_mood IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral'));

ALTER TABLE emotional_support_response_bank
    DROP CONSTRAINT IF EXISTS emotional_support_response_bank_emotion_category_check;

UPDATE emotional_support_response_bank
SET emotion_category = CASE emotion_category
    WHEN 'stressed' THEN 'anxious'
    WHEN 'anger' THEN 'angry'
    ELSE emotion_category
END
WHERE emotion_category IN ('stressed', 'anger');

UPDATE emotional_support_cognitive_activities
SET target_emotions = ARRAY(
    SELECT CASE emotion
        WHEN 'stressed' THEN 'anxious'
        WHEN 'anger' THEN 'angry'
        ELSE emotion
    END
    FROM unnest(target_emotions) AS emotion
);

ALTER TABLE emotional_support_response_bank
    ADD CONSTRAINT emotional_support_response_bank_emotion_category_check
        CHECK (emotion_category IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral'));

ALTER TABLE emotional_support_emotion_sessions
    DROP CONSTRAINT IF EXISTS emotional_support_emotion_sessions_detected_emotion_check;

UPDATE emotional_support_emotion_sessions
SET detected_emotion = CASE detected_emotion
    WHEN 'stressed' THEN 'anxious'
    WHEN 'anger' THEN 'angry'
    ELSE detected_emotion
END
WHERE detected_emotion IN ('stressed', 'anger');

ALTER TABLE emotional_support_emotion_sessions
    ADD CONSTRAINT emotional_support_emotion_sessions_detected_emotion_check
        CHECK (detected_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral'));

ALTER TABLE chat_logs
    DROP CONSTRAINT IF EXISTS chat_logs_detected_emotion_check;

UPDATE chat_logs
SET detected_emotion = CASE detected_emotion
    WHEN 'stressed' THEN 'anxious'
    WHEN 'anger' THEN 'angry'
    ELSE detected_emotion
END
WHERE detected_emotion IN ('stressed', 'anger');

ALTER TABLE chat_logs
    ADD CONSTRAINT chat_logs_detected_emotion_check
        CHECK (detected_emotion IS NULL OR detected_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral'));

ALTER TABLE emotional_support_interventions
    ADD COLUMN IF NOT EXISTS response_bank_id UUID REFERENCES emotional_support_response_bank(id) ON DELETE SET NULL;

ALTER TABLE emotional_support_interventions
    DROP CONSTRAINT IF EXISTS emotional_support_interventions_response_type_check,
    ADD CONSTRAINT emotional_support_interventions_response_type_check
        CHECK (response_type IN ('empathetic_reply', 'calming_support', 'motivation', 'escalation_hold', 'de_escalation'));

ALTER TABLE emotional_support_interventions
    DROP CONSTRAINT IF EXISTS emotional_support_interventions_response_source_check,
    ADD CONSTRAINT emotional_support_interventions_response_source_check
        CHECK (response_source IN ('template', 'llm', 'hybrid', 'response_bank'));

ALTER TABLE emotional_support_trend_snapshots
    DROP CONSTRAINT IF EXISTS emotional_support_trend_snapshots_dominant_emotion_check;

UPDATE emotional_support_trend_snapshots
SET dominant_emotion = CASE dominant_emotion
    WHEN 'stressed' THEN 'anxious'
    WHEN 'anger' THEN 'angry'
    ELSE dominant_emotion
END
WHERE dominant_emotion IN ('stressed', 'anger');

ALTER TABLE emotional_support_trend_snapshots
    ADD CONSTRAINT emotional_support_trend_snapshots_dominant_emotion_check
        CHECK (dominant_emotion IS NULL OR dominant_emotion IN ('happy', 'sad', 'angry', 'anxious', 'lonely', 'confused', 'neutral'));
