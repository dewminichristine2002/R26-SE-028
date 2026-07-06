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

ALTER TABLE emotional_support_response_bank
    DROP CONSTRAINT IF EXISTS emotional_support_response_bank_emotion_category_check;

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
        'Thank you for checking in. Let us keep the day steady with one small mental activity.',
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