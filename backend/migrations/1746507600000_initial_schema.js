/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    'routines',
    {
      id: 'id',
      profile_key: { type: 'text', notNull: true, unique: true, default: 'default' },
      breakfast_time: { type: 'text', notNull: true, default: '08:00 AM' },
      lunch_time: { type: 'text', notNull: true, default: '01:00 PM' },
      dinner_time: { type: 'text', notNull: true, default: '07:00 PM' },
      sleep_time: { type: 'text', notNull: true, default: '10:30 PM' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'users',
    {
      id: 'id',
      full_name: { type: 'text', notNull: true },
      email: { type: 'text', notNull: true, unique: true },
      password_hash: { type: 'text', notNull: true },
      phone: { type: 'text' },
      date_of_birth: { type: 'date' },
      blood_type: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'user_routines',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        unique: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      breakfast_time: { type: 'text', notNull: true, default: '08:00 AM' },
      lunch_time: { type: 'text', notNull: true, default: '01:00 PM' },
      dinner_time: { type: 'text', notNull: true, default: '07:00 PM' },
      sleep_time: { type: 'text', notNull: true, default: '10:30 PM' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'user_medications',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      medicine_name: { type: 'text', notNull: true, default: '' },
      total_quantity: { type: 'numeric', notNull: true, default: 0 },
      dosage_mg: { type: 'numeric', notNull: true, default: 0 },
      daily_amount: { type: 'integer', notNull: true, default: 1 },
      dose_form: { type: 'text', notNull: true, default: 'Tablet' },
      take_with: { type: 'text', notNull: true, default: '' },
      intake_timing: { type: 'text', notNull: true, default: '' },
      selected_color: { type: 'text' },
      selected_shape: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createIndex('user_medications', 'user_id', {
    ifNotExists: true,
    name: 'user_medications_user_id_idx',
  });

  pgm.createTable(
    'user_allergy_profiles',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        unique: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      age: { type: 'text', notNull: true, default: '' },
      gender: { type: 'text', notNull: true, default: '' },
      has_medicine_allergy: { type: 'boolean' },
      known_allergies_text: { type: 'text', notNull: true, default: '' },
      chronic_diseases_text: { type: 'text', notNull: true, default: '' },
      current_medications_text: { type: 'text', notNull: true, default: '' },
      emergency_contact: { type: 'text', notNull: true, default: '' },
      caregiver_details: { type: 'text', notNull: true, default: '' },
      caregiver_email: { type: 'text', notNull: true, default: '' },
      caregiver_phone: { type: 'text', notNull: true, default: '' },
      profile_completed: { type: 'boolean', notNull: true, default: false },
      reaction_symptoms_text: { type: 'text', notNull: true, default: '' },
      suspected_medicine_names_text: { type: 'text', notNull: true, default: '' },
      avoided_medicines_text: { type: 'text', notNull: true, default: '' },
      antibiotic_painkiller_reaction: { type: 'text', notNull: true, default: '' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'allergy_questionnaire_answers',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      question_key: { type: 'text', notNull: true },
      answer_text: { type: 'text', notNull: true, default: '' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS allergy_questionnaire_answers_user_question_unique
    ON allergy_questionnaire_answers (user_id, question_key);
  `);

  pgm.createTable(
    'allergy_cards',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      title: { type: 'text', notNull: true },
      medicine_name: { type: 'text', notNull: true, default: '' },
      normalized_drug_name: { type: 'text', notNull: true, default: '' },
      rxnorm_cui: { type: 'text', notNull: true, default: '' },
      ingredient_name: { type: 'text', notNull: true, default: '' },
      therapeutic_class: { type: 'text', notNull: true, default: '' },
      status: { type: 'text', notNull: true, default: 'draft' },
      risk_score: { type: 'integer' },
      risk_level: { type: 'text', notNull: true, default: '' },
      side_effect_count: { type: 'integer', notNull: true, default: 0 },
      severe_side_effect_count: { type: 'integer', notNull: true, default: 0 },
      side_effect_match_count: { type: 'integer', notNull: true, default: 0 },
      interaction_count: { type: 'integer', notNull: true, default: 0 },
      max_interaction_severity: { type: 'text', notNull: true, default: '' },
      knowledge_sources: { type: 'text', notNull: true, default: '' },
      guidelines_json: { type: 'text', notNull: true, default: '[]' },
      medication_knowledge_json: { type: 'text', notNull: true, default: '{}' },
      data_used_json: { type: 'text', notNull: true, default: '{}' },
      explanation: { type: 'text', notNull: true, default: '' },
      recommendation: { type: 'text', notNull: true, default: '' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'allergy_card_risk_factors',
    {
      id: 'id',
      allergy_card_id: {
        type: 'integer',
        notNull: true,
        references: '"allergy_cards"',
        onDelete: 'CASCADE',
      },
      factor_type: { type: 'text', notNull: true, default: '' },
      factor_label: { type: 'text', notNull: true, default: '' },
      severity: { type: 'text', notNull: true, default: '' },
      score: { type: 'integer', notNull: true, default: 0 },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'medicine_check_history',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      input_method: { type: 'text', notNull: true, default: '' },
      raw_input: { type: 'text', notNull: true, default: '' },
      medicine_name: { type: 'text', notNull: true, default: '' },
      normalized_drug_name: { type: 'text', notNull: true, default: '' },
      rxnorm_cui: { type: 'text', notNull: true, default: '' },
      ingredient_name: { type: 'text', notNull: true, default: '' },
      therapeutic_class: { type: 'text', notNull: true, default: '' },
      dose: { type: 'text', notNull: true, default: '' },
      frequency: { type: 'text', notNull: true, default: '' },
      risk_score: { type: 'integer' },
      risk_level: { type: 'text', notNull: true, default: '' },
      side_effect_count: { type: 'integer', notNull: true, default: 0 },
      severe_side_effect_count: { type: 'integer', notNull: true, default: 0 },
      side_effect_match_count: { type: 'integer', notNull: true, default: 0 },
      interaction_count: { type: 'integer', notNull: true, default: 0 },
      max_interaction_severity: { type: 'text', notNull: true, default: '' },
      knowledge_sources: { type: 'text', notNull: true, default: '' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.createTable(
    'reaction_logs',
    {
      id: 'id',
      user_id: {
        type: 'integer',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      medicine_check_id: {
        type: 'integer',
        references: '"medicine_check_history"',
        onDelete: 'SET NULL',
      },
      symptoms: { type: 'text', notNull: true, default: '' },
      severity: { type: 'text', notNull: true, default: '' },
      notes: { type: 'text', notNull: true, default: '' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    },
    { ifNotExists: true }
  );

  pgm.sql(`
    INSERT INTO user_routines (user_id)
    SELECT id
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO user_allergy_profiles (user_id)
    SELECT id
    FROM users
    ON CONFLICT (user_id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('reaction_logs', { ifExists: true, cascade: true });
  pgm.dropTable('medicine_check_history', { ifExists: true, cascade: true });
  pgm.dropTable('allergy_card_risk_factors', { ifExists: true, cascade: true });
  pgm.dropTable('allergy_cards', { ifExists: true, cascade: true });
  pgm.dropTable('allergy_questionnaire_answers', { ifExists: true, cascade: true });
  pgm.dropTable('user_allergy_profiles', { ifExists: true, cascade: true });
  pgm.dropTable('user_medications', { ifExists: true, cascade: true });
  pgm.dropTable('user_routines', { ifExists: true, cascade: true });
  pgm.dropTable('users', { ifExists: true, cascade: true });
  pgm.dropTable('routines', { ifExists: true, cascade: true });
};
