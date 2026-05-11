/**
 * Schema catalog used by the conversational dashboard's NL2SQL prompt.
 *
 * IMPORTANT
 * ---------
 * Every entry below is consumed by:
 *   1. The Llama 3 system prompt (so the LLM knows tables, columns and the user_id rule).
 *   2. The SQL safety validator (only tables present here can be referenced).
 *
 * Rules:
 *  - `userIdColumn`        : if present, every query touching this table MUST contain
 *                            `<table>.user_id = $1`. The validator enforces this.
 *  - `userIdColumn: null`  : a global catalog (e.g. `medicines`) — read-only, no user scoping.
 *  - Sensitive columns (password_hash, raw caregiver phone, etc.) are intentionally OMITTED
 *    so they never reach the LLM and never come back in retrieved rows.
 */

const TABLES = {
  users: {
    purpose: 'The patient (elder) account. One row per registered user. Caregivers log in against the same row using caregiver_email + caregiver_phone.',
    userIdColumn: 'id',
    userIdColumnIsPrimaryKey: true,
    columns: {
      id: 'integer primary key',
      full_name: 'text',
      date_of_birth: 'date',
      blood_type: 'text',
      caregiver_email: 'text (caregiver login email)',
      caregiver_phone: 'text (caregiver login phone)',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
    notes: 'Use id = $1 to scope to the current user. NEVER select password_hash, email or phone.',
  },

  user_routines: {
    purpose: 'Per-user daily routine clock used for medication reminders.',
    userIdColumn: 'user_id',
    columns: {
      user_id: 'integer FK users.id',
      breakfast_time: "text e.g. '08:00 AM'",
      lunch_time: 'text',
      dinner_time: 'text',
      sleep_time: 'text',
      updated_at: 'timestamptz',
    },
  },

  user_allergy_profiles: {
    purpose: "Patient's allergy & health profile (free-text fields, one row per user).",
    userIdColumn: 'user_id',
    columns: {
      user_id: 'integer FK users.id',
      age: 'text',
      gender: 'text',
      has_medicine_allergy: 'boolean nullable',
      known_allergies_text: 'text (comma-separated allergies)',
      chronic_diseases_text: 'text',
      current_medications_text: 'text',
      reaction_symptoms_text: 'text',
      suspected_medicine_names_text: 'text',
      avoided_medicines_text: 'text',
      antibiotic_painkiller_reaction: 'text',
      profile_completed: 'boolean',
      updated_at: 'timestamptz',
    },
  },

  allergy_questionnaire_answers: {
    purpose: 'Per-user answers to the structured allergy questionnaire.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      question_key: 'text (stable key for the question)',
      answer_text: 'text',
      created_at: 'timestamptz',
    },
  },

  allergy_cards: {
    purpose: "Saved 'medicine safety analysis' cards. One row per medicine the patient checked.",
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      title: 'text',
      medicine_name: 'text',
      normalized_drug_name: 'text',
      rxnorm_cui: 'text',
      ingredient_name: 'text',
      therapeutic_class: 'text',
      status: "text e.g. 'draft' | 'completed'",
      risk_score: 'integer (0-100, higher = riskier)',
      risk_level: "text 'Safe' | 'Warning' | 'Dangerous'",
      side_effect_count: 'integer',
      severe_side_effect_count: 'integer',
      interaction_count: 'integer',
      max_interaction_severity: "text 'low' | 'medium' | 'high'",
      explanation: 'text',
      recommendation: 'text',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
  },

  allergy_card_risk_factors: {
    purpose: 'The line-items that explain why an allergy_card has its risk score.',
    userIdColumn: null,
    joinHint: 'Always JOIN on allergy_cards and filter the parent card by user_id = $1.',
    columns: {
      id: 'integer',
      allergy_card_id: 'integer FK allergy_cards.id',
      factor_type: "text e.g. 'allergy_match' | 'ddinter_interaction' | 'dangerous_combination'",
      factor_label: 'text',
      severity: "text 'low' | 'medium' | 'high'",
      score: 'integer',
    },
  },

  medicine_check_history: {
    purpose: 'Audit trail of every medicine safety analysis the user ran (one row per check).',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      input_method: "text 'manual' | 'scan' | 'voice'",
      raw_input: 'text',
      medicine_name: 'text',
      normalized_drug_name: 'text',
      dose: 'text',
      frequency: 'text',
      risk_score: 'integer',
      risk_level: "text 'Safe' | 'Warning' | 'Dangerous'",
      side_effect_count: 'integer',
      interaction_count: 'integer',
      max_interaction_severity: 'text',
      created_at: 'timestamptz',
    },
  },

  reaction_logs: {
    purpose: 'Adverse reactions reported by the user after taking a medicine.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      medicine_check_id: 'integer FK medicine_check_history.id (nullable)',
      symptoms: 'text',
      severity: 'text',
      notes: 'text',
      created_at: 'timestamptz',
    },
  },

  medicines: {
    purpose: 'Global catalog of recognized medicines (NOT user-specific). Read-only reference.',
    userIdColumn: null,
    columns: {
      'medicineName / name / medicine_name': 'text (column name varies; prefer LOWER(BTRIM(...)) comparisons)',
      color: 'text',
      shape: 'text',
    },
    notes: 'Use this only as a lookup for medicine appearance / spelling, never as primary data source.',
  },

  user_medications: {
    purpose: "The patient's prescribed medicines (active pills they are taking).",
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      medicine_name: 'text',
      selected_color: 'text',
      selected_shape: 'text',
      total_quantity: 'numeric (initial supply)',
      dosage_mg: 'numeric',
      daily_amount: 'numeric (pills per day)',
      dose_form: 'text',
      take_with: 'text',
      intake_timing: 'text',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
  },

  medication_stock: {
    purpose: 'Running pill stock per prescribed medicine (one row per user_medications.id).',
    userIdColumn: 'user_id',
    columns: {
      medication_id: 'integer FK user_medications.id',
      user_id: 'integer FK users.id',
      initial_quantity: 'numeric',
      current_quantity: 'numeric (decrements when status=taken/overdose)',
      updated_at: 'timestamptz',
    },
  },

  medication_status_events: {
    purpose: 'Each medicine intake event the patient logged. Central adherence table.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      medication_id: 'integer FK user_medications.id',
      status: "text MUST be one of 'taken' | 'remind' | 'overdose' | 'speak' | 'not-taken'",
      overdose_tablets: 'numeric (only when status=overdose)',
      quantity_used: 'numeric',
      schedule_slot: "text e.g. 'morning' | 'noon' | 'evening' | 'night'",
      dose_number: 'integer',
      times_per_day: 'integer',
      routine_time: "text e.g. '08:00 AM'",
      reminder_time: 'timestamptz',
      event_time: 'timestamptz (when the dose was actually taken / missed)',
      created_at: 'timestamptz',
    },
    notes: "There is NO 'missed' status; missed doses use status = 'not-taken'.",
  },

  caregiver_alerts: {
    purpose: 'Medication-related alerts pushed to the caregiver (overdose, low stock, refill request).',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id (the patient)',
      medication_id: 'integer FK user_medications.id (nullable)',
      status_event_id: 'integer FK medication_status_events.id (nullable)',
      title: "text e.g. 'Overdose Alert' | 'Low Stock Alert' | 'Refill Alert'",
      message: 'text',
      is_read: 'boolean',
      created_at: 'timestamptz',
      read_at: 'timestamptz',
    },
  },

  user_health_profiles: {
    purpose: 'Structured health values for risk prediction (diabetes and stroke phase 1 inputs). One row per user.',
    userIdColumn: 'user_id',
    columns: {
      user_id: 'integer FK users.id',
      age: 'integer',
      gender: 'text',
      blood_sugar: 'numeric',
      systolic_bp: 'numeric',
      diastolic_bp: 'numeric',
      height_cm: 'numeric',
      weight_kg: 'numeric',
      smoking_status: 'text',
      physical_activity_level: 'text',
      family_history: 'text',
      existing_disease_history: 'text[]',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
  },

  diabetes_risk_predictions: {
    purpose: 'Saved diabetes risk prediction results for longitudinal monitoring and explanation history.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      risk_type: "text currently 'Diabetes'",
      risk_level: "text 'Low' | 'Medium' | 'High'",
      confidence: 'integer (0-100)',
      probability: 'numeric (0-1)',
      selected_algorithm: 'text',
      factors: 'jsonb[] style list (stored as jsonb array)',
      input_snapshot: 'jsonb',
      summary: 'text',
      conversation_id: 'integer FK assistant_conversations.id (nullable)',
      created_at: 'timestamptz',
    },
    notes: 'Predictions are for health risk awareness only and are not medical diagnosis.',
  },

  stroke_risk_predictions: {
    purpose: 'Saved stroke risk prediction results for longitudinal monitoring and explanation history.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      risk_type: "text currently 'Stroke'",
      risk_level: "text 'Low' | 'Medium' | 'High'",
      confidence: 'integer (0-100)',
      probability: 'numeric (0-1)',
      selected_algorithm: 'text',
      factors: 'jsonb[] style list (stored as jsonb array)',
      input_snapshot: 'jsonb',
      summary: 'text',
      conversation_id: 'integer FK assistant_conversations.id (nullable)',
      created_at: 'timestamptz',
    },
    notes: 'Predictions are for health risk awareness only and are not medical diagnosis.',
  },

  hypertension_risk_predictions: {
    purpose: 'Saved hypertension risk prediction results for longitudinal monitoring and explanation history.',
    userIdColumn: 'user_id',
    columns: {
      id: 'integer',
      user_id: 'integer FK users.id',
      risk_type: "text currently 'Hypertension'",
      risk_level: "text 'Low' | 'Medium' | 'High'",
      confidence: 'integer (0-100)',
      probability: 'numeric (0-1)',
      selected_algorithm: 'text',
      factors: 'jsonb[] style list (stored as jsonb array)',
      input_snapshot: 'jsonb',
      summary: 'text',
      conversation_id: 'integer FK assistant_conversations.id (nullable)',
      created_at: 'timestamptz',
    },
    notes: 'Predictions are for health risk awareness only and are not medical diagnosis.',
  },

  emotional_support_emotion_sessions: {
    purpose: 'Each mood / emotion check-in the patient submitted (text, voice, emoji or multimodal).',
    userIdColumn: 'elder_user_id',
    columns: {
      id: 'uuid',
      elder_user_id: 'integer FK users.id',
      input_mode: "text 'emoji' | 'text' | 'voice' | 'multimodal'",
      check_in_type: "text 'manual' | 'scheduled' | 'triggered'",
      detected_emotion: "text 'happy' | 'sad' | 'angry' | 'anxious' | 'lonely' | 'confused' | 'neutral'",
      sentiment_score: 'numeric (0-1)',
      stress_score: 'numeric (0-1)',
      loneliness_score: 'numeric (0-1)',
      confidence_score: 'numeric (0-1)',
      risk_level: "text 'low' | 'medium' | 'high'",
      created_at: 'timestamptz',
    },
  },

  emotional_support_interventions: {
    purpose: 'The chatbot reply chosen for each mood session.',
    userIdColumn: 'elder_user_id',
    columns: {
      id: 'uuid',
      session_id: 'uuid FK emotional_support_emotion_sessions.id',
      elder_user_id: 'integer FK users.id',
      response_type: "text 'empathetic_reply' | 'calming_support' | 'motivation' | 'escalation_hold' | 'de_escalation'",
      response_text: 'text',
      response_source: "text 'template' | 'llm' | 'hybrid' | 'response_bank'",
      trigger_emotion: 'text',
      trigger_risk_level: 'text',
      created_at: 'timestamptz',
    },
  },

  emotional_support_caregiver_alerts: {
    purpose: 'Mood-related alerts pushed to caregivers (negative mood trend, high stress, loneliness).',
    userIdColumn: 'elder_user_id',
    columns: {
      id: 'uuid',
      elder_user_id: 'integer FK users.id',
      caregiver_user_id: 'integer',
      session_id: 'uuid FK emotional_support_emotion_sessions.id (nullable)',
      alert_type: "text 'negative_mood_trend' | 'high_stress' | 'loneliness_pattern' | 'missed_checkins'",
      severity: "text 'medium' | 'high' | 'critical'",
      title: 'text',
      message: 'text',
      status: "text 'open' | 'acknowledged' | 'resolved'",
      created_at: 'timestamptz',
      acknowledged_at: 'timestamptz',
      resolved_at: 'timestamptz',
    },
  },

  emotional_support_trend_snapshots: {
    purpose: 'Daily / weekly aggregate snapshots of the patient\u2019s mood data.',
    userIdColumn: 'elder_user_id',
    columns: {
      id: 'uuid',
      elder_user_id: 'integer FK users.id',
      period_type: "text 'daily' | 'weekly'",
      period_start: 'timestamptz',
      period_end: 'timestamptz',
      dominant_emotion: 'text',
      average_stress_score: 'numeric',
      average_loneliness_score: 'numeric',
      check_in_completion_rate: 'numeric (0-1)',
      alert_count: 'integer',
      created_at: 'timestamptz',
    },
  },

  health_advice_chunks: {
    purpose: 'Trusted RAG knowledge chunks for diabetes, hypertension and stroke advice. Global source catalog, not user-specific.',
    userIdColumn: null,
    columns: {
      id: 'integer',
      source_name: 'text',
      source_url: 'text',
      risk_type: "text 'General' | 'Diabetes' | 'Hypertension' | 'Stroke'",
      topic: 'text',
      content_chunk: 'text',
      created_at: 'timestamptz',
      updated_at: 'timestamptz',
    },
    notes: 'Use only as trusted source metadata. Do not answer heart disease advice from this catalog.',
  },
};

const SAFE_RELATIONSHIPS = [
  'allergy_card_risk_factors.allergy_card_id -> allergy_cards.id (filter parent card by user_id)',
  'reaction_logs.medicine_check_id -> medicine_check_history.id',
  'medication_stock.medication_id -> user_medications.id',
  'medication_status_events.medication_id -> user_medications.id',
  'caregiver_alerts.medication_id -> user_medications.id',
  'caregiver_alerts.status_event_id -> medication_status_events.id',
  'diabetes_risk_predictions.conversation_id -> assistant_conversations.id',
  'emotional_support_interventions.session_id -> emotional_support_emotion_sessions.id',
  'emotional_support_caregiver_alerts.session_id -> emotional_support_emotion_sessions.id',
];

const ALLOWED_TABLES = new Set(Object.keys(TABLES));

const buildPromptDigest = () => {
  const lines = [];
  lines.push('# ElderMeds schema. $1 = current authenticated user_id.');
  lines.push('# Format: table(user_scope) -> col1, col2, ...   [notes]');
  lines.push('');

  for (const [tableName, table] of Object.entries(TABLES)) {
    let scope;
    if (table.userIdColumn === null) {
      scope = 'GLOBAL';
    } else if (table.userIdColumnIsPrimaryKey) {
      scope = `${tableName}.${table.userIdColumn}=$1 (PK)`;
    } else {
      scope = `${tableName}.${table.userIdColumn}=$1`;
    }

    const cols = Object.keys(table.columns).join(', ');
    let line = `${tableName}(${scope}) -> ${cols}`;
    if (table.notes) {
      line += `   [${table.notes}]`;
    }
    lines.push(line);
  }

  lines.push('');
  lines.push('# Joins:');
  for (const rel of SAFE_RELATIONSHIPS) {
    lines.push(`# - ${rel}`);
  }

  lines.push('');
  lines.push('# Hard rules:');
  lines.push('# - status values for medication_status_events: taken | not-taken | remind | overdose | speak');
  lines.push('# - emotions: happy | sad | angry | anxious | lonely | confused | neutral');
  lines.push('# - allergy risk_level: Safe | Warning | Dangerous');
  lines.push('# - NEVER select password_hash, email, phone, caregiver_email, caregiver_phone');

  return lines.join('\n');
};

module.exports = {
  TABLES,
  ALLOWED_TABLES,
  SAFE_RELATIONSHIPS,
  buildPromptDigest,
};
