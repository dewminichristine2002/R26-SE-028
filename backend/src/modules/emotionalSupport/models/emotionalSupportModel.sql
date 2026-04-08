CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS emotional_support_elder_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id UUID NOT NULL,
    display_name TEXT,
    age INTEGER,
    gender TEXT,
    living_status TEXT CHECK (living_status IN ('alone', 'family', 'care_home')),
    baseline_mood TEXT CHECK (baseline_mood IN ('happy', 'neutral', 'sad', 'lonely', 'stressed')),
    cognitive_level TEXT CHECK (cognitive_level IN ('low', 'medium', 'high')),
    check_in_times TEXT[] DEFAULT ARRAY[]::TEXT[],
    voice_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    chronic_conditions TEXT[] DEFAULT ARRAY[]::TEXT[],
    clinical_notes TEXT,
    caregiver_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
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
    elder_user_id UUID NOT NULL,
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
    detected_emotion TEXT NOT NULL CHECK (detected_emotion IN ('happy', 'neutral', 'sad', 'lonely', 'stressed')),
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
    elder_user_id UUID NOT NULL,
    response_type TEXT NOT NULL CHECK (response_type IN ('empathetic_reply', 'calming_support', 'motivation', 'escalation_hold')),
    response_text TEXT NOT NULL,
    response_source TEXT NOT NULL CHECK (response_source IN ('template', 'llm', 'hybrid')),
    trigger_emotion TEXT,
    trigger_risk_level TEXT,
    selected_because JSONB NOT NULL DEFAULT '[]'::JSONB,
    follow_up_prompt TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emotional_support_activity_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    elder_user_id UUID NOT NULL,
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
    elder_user_id UUID NOT NULL,
    caregiver_user_id UUID NOT NULL,
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
    elder_user_id UUID NOT NULL,
    period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    dominant_emotion TEXT CHECK (dominant_emotion IN ('happy', 'neutral', 'sad', 'lonely', 'stressed')),
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
        'Memory Reflection',
        'reflection',
        'easy',
        ARRAY['sad', 'lonely'],
        'Share one pleasant memory from this week.',
        'text',
        '[]'::JSONB,
        90
    ),
    (
        'Breathing Pause',
        'breathing',
        'easy',
        ARRAY['stressed'],
        'Breathe in for 4 seconds, hold for 2, and breathe out for 6.',
        'none',
        '[]'::JSONB,
        60
    ),
    (
        'Orientation Check',
        'orientation',
        'easy',
        ARRAY['neutral', 'stressed'],
        'What day is it today and what is one thing you plan to do next?',
        'text',
        '[]'::JSONB,
        75
    ),
    (
        'Attention Challenge',
        'attention',
        'medium',
        ARRAY['neutral', 'sad'],
        'Which of these items belongs in a kitchen?',
        'choice',
        '["Pillow", "Spoon", "Book", "Shoe"]'::JSONB,
        45
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
