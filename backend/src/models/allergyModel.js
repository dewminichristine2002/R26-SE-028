const { pool } = require('../config/db');
const { FEEDBACK_RECORD_TYPES } = require('../config/feedbackConstants');
const {
  decodeFeedbackNotes,
  serializeFeedbackNotes,
} = require('../services/feedbackAnonymizationService');

let allergyProfileColumnsEnsured = false;
let analysisColumnsEnsured = false;
let userMedicationTableEnsured = false;
const safeJsonParse = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeText = (value) => (value == null ? '' : String(value).trim());
const toIntegerScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric);
};

const parseDosageMg = (value) => {
  const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  return match ? Number(match[1]) : 0;
};

const parseDailyAmount = (value) => {
  const text = String(value || '').toLowerCase();
  if (/\b(qid|four\s+times)\b/.test(text)) {
    return 4;
  }
  if (/\b(tds|tid|three\s+times)\b/.test(text)) {
    return 3;
  }
  if (/\b(bd|bid|twice|two\s+times)\b/.test(text)) {
    return 2;
  }
  if (/\b(od|once|daily|night|morning)\b/.test(text)) {
    return 1;
  }
  return 1;
};

const parseDoseForm = (value) => {
  const text = String(value || '').toLowerCase();
  if (/\bcap(?:sule)?\b/.test(text)) return 'Capsule';
  if (/\btab(?:let)?\b/.test(text)) return 'Tablet';
  if (/\bsyrup|syp\b/.test(text)) return 'Syrup';
  if (/\binj(?:ection)?\b/.test(text)) return 'Injection';
  if (/\bcream\b/.test(text)) return 'Cream';
  if (/\bdrops?\b/.test(text)) return 'Drops';
  return 'Tablet';
};

const parseMedicineName = (value) =>
  normalizeText(value)
    .replace(/^\d+\s*[\).:-]?\s*/, '')
    .replace(/\b(?:tab(?:let)?|cap(?:sule)?|syrup|syp|inj(?:ection)?|cream|drops?)\b\.?/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, ' ')
    .replace(/\b(?:od|bd|bid|tds|tid|qid|prn|once|twice|three|four|daily|after|before|food|night|morning|evening)\b/gi, ' ')
    .replace(/[(),/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseMedicationTextItems = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }

  const pieces = raw
    .split(/\r?\n|;/)
    .flatMap((segment) => segment.split(/,(?=\s*[A-Za-z])/))
    .map((segment) => normalizeText(segment))
    .filter(Boolean);

  const seen = new Set();
  const results = [];

  pieces.forEach((piece) => {
    const medicineName = parseMedicineName(piece);
    if (!medicineName) {
      return;
    }

    const key = medicineName.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);

    results.push({
      medicineName,
      totalQuantity: 0,
      dosageMg: parseDosageMg(piece),
      dailyAmount: parseDailyAmount(piece),
      doseForm: parseDoseForm(piece),
    });
  });

  return results;
};

const formatUserMedicationRow = (row) => {
  const name = normalizeText(row.medicine_name);
  const dosage = Number(row.dosage_mg || 0) > 0 ? `${Number(row.dosage_mg)}mg` : '';
  return [name, dosage].filter(Boolean).join(' ').trim();
};

const buildCurrentMedicationsTextFromRows = (rows) =>
  rows
    .map(formatUserMedicationRow)
    .filter(Boolean)
    .join(', ');

const ensureUserMedicationTable = async () => {
  if (userMedicationTableEnsured) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_medications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      medicine_name TEXT NOT NULL DEFAULT '',
      total_quantity NUMERIC NOT NULL DEFAULT 0,
      dosage_mg NUMERIC NOT NULL DEFAULT 0,
      daily_amount INTEGER NOT NULL DEFAULT 1,
      dose_form TEXT NOT NULL DEFAULT 'Tablet',
      take_with TEXT NOT NULL DEFAULT '',
      intake_timing TEXT NOT NULL DEFAULT '',
      selected_color TEXT,
      selected_shape TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS take_with TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS intake_timing TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_color TEXT`);
  await pool.query(`ALTER TABLE user_medications ADD COLUMN IF NOT EXISTS selected_shape TEXT`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS user_medications_user_id_idx
    ON user_medications (user_id)
  `);

  userMedicationTableEnsured = true;
};

const listUserMedicationRows = async (executor, userId) => {
  await ensureUserMedicationTable();
  const result = await executor.query(
    `
      SELECT
        id,
        user_id,
        medicine_name,
        total_quantity,
        dosage_mg,
        daily_amount,
        dose_form,
        take_with,
        intake_timing,
        selected_color,
        selected_shape,
        created_at,
        updated_at
      FROM user_medications
      WHERE user_id = $1
      ORDER BY id ASC
    `,
    [userId]
  );

  return result.rows;
};

const replaceUserMedications = async (executor, userId, currentMedicationsText) => {
  await ensureUserMedicationTable();

  const parsedItems = parseMedicationTextItems(currentMedicationsText);
  const existingRows = await listUserMedicationRows(executor, userId);
  const existingByName = new Map(
    existingRows.map((row) => [normalizeText(row.medicine_name).toLowerCase(), row])
  );

  await executor.query(`DELETE FROM user_medications WHERE user_id = $1`, [userId]);

  for (const item of parsedItems) {
    const existing = existingByName.get(item.medicineName.toLowerCase());
    await executor.query(
      `
        INSERT INTO user_medications (
          user_id,
          medicine_name,
          total_quantity,
          dosage_mg,
          daily_amount,
          dose_form,
          take_with,
          intake_timing,
          selected_color,
          selected_shape,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `,
      [
        userId,
        item.medicineName,
        existing ? Number(existing.total_quantity || 0) : Number(item.totalQuantity || 0),
        item.dosageMg > 0 ? item.dosageMg : Number(existing?.dosage_mg || 0),
        item.dailyAmount > 0 ? item.dailyAmount : Number(existing?.daily_amount || 1),
        existing?.dose_form || item.doseForm || 'Tablet',
        existing?.take_with || '',
        existing?.intake_timing || '',
        existing?.selected_color || null,
        existing?.selected_shape || null,
      ]
    );
  }

  const syncedRows = await listUserMedicationRows(executor, userId);
  return {
    rows: syncedRows,
    currentMedicationsText: buildCurrentMedicationsTextFromRows(syncedRows),
  };
};

const ensureAllergyProfileColumns = async () => {
  if (allergyProfileColumnsEnsured) {
    return;
  }

  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS age TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT ''`);
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS reaction_symptoms_text TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS suspected_medicine_names_text TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS avoided_medicines_text TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS antibiotic_painkiller_reaction TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS caregiver_email TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS caregiver_phone TEXT NOT NULL DEFAULT ''`
  );
  await pool.query(
    `ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS feedback_consent_for_training BOOLEAN NOT NULL DEFAULT FALSE`
  );
  allergyProfileColumnsEnsured = true;
};

const getCaregiverContactFromAlerts = async (executor, userId) => {
  try {
    const result = await executor.query(
      `
        SELECT caregiver_email, caregiver_phone
        FROM caregiver_alerts
        WHERE user_id = $1
          AND (
            COALESCE(TRIM(caregiver_email), '') <> ''
            OR COALESCE(TRIM(caregiver_phone), '') <> ''
          )
        ORDER BY id DESC
        LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return { caregiverEmail: '', caregiverPhone: '' };
    }

    return {
      caregiverEmail: normalizeText(result.rows[0].caregiver_email),
      caregiverPhone: normalizeText(result.rows[0].caregiver_phone),
    };
  } catch {
    return { caregiverEmail: '', caregiverPhone: '' };
  }
};

const getHealthProfileAutofill = async (executor, userId) => {
  try {
    const result = await executor.query(
      `
        SELECT age, gender
        FROM user_health_profiles
        WHERE user_id = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return { age: '', gender: '' };
    }

    return {
      age: normalizeText(result.rows[0].age),
      gender: normalizeText(result.rows[0].gender),
    };
  } catch {
    return { age: '', gender: '' };
  }
};

const ensureAnalysisColumns = async () => {
  if (analysisColumnsEnsured) {
    return;
  }

  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS rxnorm_cui TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS ingredient_name TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS therapeutic_class TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS side_effect_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS severe_side_effect_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS side_effect_match_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS interaction_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS max_interaction_severity TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS knowledge_sources TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS guidelines_json TEXT NOT NULL DEFAULT '[]'`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS medication_knowledge_json TEXT NOT NULL DEFAULT '{}'`);
  await pool.query(`ALTER TABLE allergy_cards ADD COLUMN IF NOT EXISTS data_used_json TEXT NOT NULL DEFAULT '{}'`);

  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS rxnorm_cui TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS ingredient_name TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS therapeutic_class TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS side_effect_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS severe_side_effect_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS side_effect_match_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS interaction_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS max_interaction_severity TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE medicine_check_history ADD COLUMN IF NOT EXISTS knowledge_sources TEXT NOT NULL DEFAULT ''`);

  analysisColumnsEnsured = true;
};

const mapProfileRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  age: row.age,
  gender: row.gender,
  hasMedicineAllergy: row.has_medicine_allergy,
  knownAllergiesText: row.known_allergies_text,
  chronicDiseasesText: row.chronic_diseases_text,
  currentMedicationsText: row.current_medications_text,
  emergencyContact: row.emergency_contact,
  caregiverDetails: row.caregiver_details,
  caregiverEmail: row.caregiver_email || '',
  caregiverPhone: row.caregiver_phone || '',
  profileCompleted: Boolean(row.profile_completed),
  reactionSymptomsText: row.reaction_symptoms_text || '',
  suspectedMedicineNamesText: row.suspected_medicine_names_text || '',
  avoidedMedicinesText: row.avoided_medicines_text || '',
  antibioticPainkillerReaction: row.antibiotic_painkiller_reaction || '',
  feedbackConsentForTraining: Boolean(row.feedback_consent_for_training),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCardRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  medicineName: row.medicine_name,
  normalizedDrugName: row.normalized_drug_name,
  rxnormCui: row.rxnorm_cui,
  ingredientName: row.ingredient_name,
  therapeuticClass: row.therapeutic_class,
  status: row.status,
  riskScore: row.risk_score,
  riskLevel: row.risk_level,
  sideEffectCount: row.side_effect_count,
  severeSideEffectCount: row.severe_side_effect_count,
  sideEffectMatchCount: row.side_effect_match_count,
  interactionCount: row.interaction_count,
  maxInteractionSeverity: row.max_interaction_severity,
  knowledgeSources: row.knowledge_sources ? row.knowledge_sources.split('|').filter(Boolean) : [],
  guidelines: safeJsonParse(row.guidelines_json, []),
  medicationKnowledge: safeJsonParse(row.medication_knowledge_json, {}),
  dataUsed: safeJsonParse(row.data_used_json, {}),
  explanation: row.explanation,
  recommendation: row.recommendation,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const listQuestionnaireAnswers = async (userId) => {
  const result = await pool.query(
    `
      SELECT id, user_id, question_key, answer_text, created_at
      FROM allergy_questionnaire_answers
      WHERE user_id = $1
      ORDER BY question_key ASC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    questionKey: row.question_key,
    answerText: row.answer_text,
    createdAt: row.created_at,
  }));
};

const getProfile = async (userId) => {
  await ensureAllergyProfileColumns();
  await ensureUserMedicationTable();

  const result = await pool.query(
    `
      SELECT *
      FROM user_allergy_profiles
      WHERE user_id = $1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    const inserted = await pool.query(
      `
        INSERT INTO user_allergy_profiles (user_id)
        VALUES ($1)
        RETURNING *
      `,
      [userId]
    );

    const insertedProfile = mapProfileRow(inserted.rows[0]);
    const medicationRows = await listUserMedicationRows(pool, userId);
    const caregiverContact = await getCaregiverContactFromAlerts(pool, userId);
    const healthProfile = await getHealthProfileAutofill(pool, userId);
    return {
      ...insertedProfile,
      age: healthProfile.age || insertedProfile.age,
      gender: healthProfile.gender || insertedProfile.gender,
      currentMedicationsText:
        medicationRows.length > 0
          ? buildCurrentMedicationsTextFromRows(medicationRows)
          : insertedProfile.currentMedicationsText,
      caregiverEmail: caregiverContact.caregiverEmail || insertedProfile.caregiverEmail,
      caregiverPhone: caregiverContact.caregiverPhone || insertedProfile.caregiverPhone,
    };
  }

  const profile = mapProfileRow(result.rows[0]);
  const medicationRows = await listUserMedicationRows(pool, userId);
  const caregiverContact = await getCaregiverContactFromAlerts(pool, userId);
  const healthProfile = await getHealthProfileAutofill(pool, userId);
  return {
    ...profile,
    age: healthProfile.age || profile.age,
    gender: healthProfile.gender || profile.gender,
    currentMedicationsText:
      medicationRows.length > 0
        ? buildCurrentMedicationsTextFromRows(medicationRows)
        : profile.currentMedicationsText,
    caregiverEmail: caregiverContact.caregiverEmail || profile.caregiverEmail,
    caregiverPhone: caregiverContact.caregiverPhone || profile.caregiverPhone,
  };
};

const upsertProfile = async (userId, payload) => {
  await ensureAllergyProfileColumns();
  await ensureUserMedicationTable();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const syncedMedications = await replaceUserMedications(client, userId, payload.currentMedicationsText);
    const profileCurrentMedicationsText = syncedMedications.currentMedicationsText;

    const result = await client.query(
      `
        INSERT INTO user_allergy_profiles (
          user_id,
          age,
          gender,
          has_medicine_allergy,
          known_allergies_text,
          chronic_diseases_text,
          current_medications_text,
          emergency_contact,
          caregiver_details,
          caregiver_email,
          caregiver_phone,
          profile_completed,
          reaction_symptoms_text,
          suspected_medicine_names_text,
          avoided_medicines_text,
          antibiotic_painkiller_reaction,
          feedback_consent_for_training,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          age = EXCLUDED.age,
          gender = EXCLUDED.gender,
          has_medicine_allergy = EXCLUDED.has_medicine_allergy,
          known_allergies_text = EXCLUDED.known_allergies_text,
          chronic_diseases_text = EXCLUDED.chronic_diseases_text,
          current_medications_text = EXCLUDED.current_medications_text,
          emergency_contact = EXCLUDED.emergency_contact,
          caregiver_details = EXCLUDED.caregiver_details,
          caregiver_email = EXCLUDED.caregiver_email,
          caregiver_phone = EXCLUDED.caregiver_phone,
          profile_completed = EXCLUDED.profile_completed,
          reaction_symptoms_text = EXCLUDED.reaction_symptoms_text,
          suspected_medicine_names_text = EXCLUDED.suspected_medicine_names_text,
          avoided_medicines_text = EXCLUDED.avoided_medicines_text,
          antibiotic_painkiller_reaction = EXCLUDED.antibiotic_painkiller_reaction,
          feedback_consent_for_training = EXCLUDED.feedback_consent_for_training,
          updated_at = NOW()
        RETURNING *
      `,
      [
        userId,
        payload.age,
        payload.gender,
        payload.hasMedicineAllergy,
        payload.knownAllergiesText,
        payload.chronicDiseasesText,
        profileCurrentMedicationsText,
        payload.emergencyContact,
        payload.caregiverDetails,
        payload.caregiverEmail,
        payload.caregiverPhone,
        payload.profileCompleted,
        payload.reactionSymptomsText,
        payload.suspectedMedicineNamesText,
        payload.avoidedMedicinesText,
        payload.antibioticPainkillerReaction,
        payload.feedbackConsentForTraining === true,
      ]
    );

    await client.query('COMMIT');

    return {
      ...mapProfileRow(result.rows[0]),
      currentMedicationsText: profileCurrentMedicationsText,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const replaceQuestionnaireAnswers = async (userId, answers) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM allergy_questionnaire_answers WHERE user_id = $1', [userId]);

    const savedAnswers = [];
    for (const answer of answers) {
      const inserted = await client.query(
        `
          INSERT INTO allergy_questionnaire_answers (user_id, question_key, answer_text)
          VALUES ($1, $2, $3)
          RETURNING id, user_id, question_key, answer_text, created_at
        `,
        [userId, answer.questionKey, answer.answerText]
      );

      const row = inserted.rows[0];
      savedAnswers.push({
        id: row.id,
        userId: row.user_id,
        questionKey: row.question_key,
        answerText: row.answer_text,
        createdAt: row.created_at,
      });
    }

    await client.query('COMMIT');
    return savedAnswers;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listCards = async (userId) => {
  await ensureAnalysisColumns();

  const result = await pool.query(
    `
      SELECT *
      FROM allergy_cards
      WHERE user_id = $1
      ORDER BY updated_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows.map(mapCardRow);
};

const getCardById = async (userId, cardId) => {
  await ensureAnalysisColumns();

  const cardResult = await pool.query(
    `
      SELECT *
      FROM allergy_cards
      WHERE user_id = $1 AND id = $2
    `,
    [userId, cardId]
  );

  if (cardResult.rows.length === 0) {
    return null;
  }

  const riskFactorsResult = await pool.query(
    `
      SELECT id, factor_type, factor_label, severity, score, created_at
      FROM allergy_card_risk_factors
      WHERE allergy_card_id = $1
      ORDER BY id ASC
    `,
    [cardId]
  );

  return {
    ...mapCardRow(cardResult.rows[0]),
    riskFactors: riskFactorsResult.rows.map((row) => ({
      id: row.id,
      factorType: row.factor_type,
      factorLabel: row.factor_label,
      severity: row.severity,
      score: row.score,
      createdAt: row.created_at,
    })),
  };
};

const createCard = async (userId, payload) => {
  await ensureAnalysisColumns();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const insertedCard = await client.query(
      `
        INSERT INTO allergy_cards (
          user_id,
          title,
          medicine_name,
          normalized_drug_name,
          rxnorm_cui,
          ingredient_name,
          therapeutic_class,
          status,
          risk_score,
          risk_level,
          side_effect_count,
          severe_side_effect_count,
          side_effect_match_count,
          interaction_count,
          max_interaction_severity,
          knowledge_sources,
          guidelines_json,
          medication_knowledge_json,
          data_used_json,
          explanation,
          recommendation,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
        RETURNING *
      `,
      [
        userId,
        payload.title,
        payload.medicineName,
        payload.normalizedDrugName,
        payload.rxnormCui,
        payload.ingredientName,
        payload.therapeuticClass,
        payload.status,
        payload.riskScore,
        payload.riskLevel,
        payload.sideEffectCount || 0,
        payload.severeSideEffectCount || 0,
        payload.sideEffectMatchCount || 0,
        payload.interactionCount || 0,
        payload.maxInteractionSeverity || '',
        Array.isArray(payload.knowledgeSources) ? payload.knowledgeSources.join('|') : '',
        JSON.stringify(Array.isArray(payload.guidelines) ? payload.guidelines : []),
        JSON.stringify(payload.medicationKnowledge && typeof payload.medicationKnowledge === 'object' ? payload.medicationKnowledge : {}),
        JSON.stringify(payload.dataUsed && typeof payload.dataUsed === 'object' ? payload.dataUsed : {}),
        payload.explanation,
        payload.recommendation,
      ]
    );

    const card = insertedCard.rows[0];
    const riskFactors = [];

    for (const factor of payload.riskFactors) {
      const factorScore = toIntegerScore(factor.score);
      const insertedFactor = await client.query(
        `
          INSERT INTO allergy_card_risk_factors (
            allergy_card_id,
            factor_type,
            factor_label,
            severity,
            score
          )
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, factor_type, factor_label, severity, score, created_at
        `,
        [card.id, factor.factorType, factor.factorLabel, factor.severity, factorScore]
      );

      const row = insertedFactor.rows[0];
      riskFactors.push({
        id: row.id,
        factorType: row.factor_type,
        factorLabel: row.factor_label,
        severity: row.severity,
        score: row.score,
        createdAt: row.created_at,
      });
    }

    if (payload.historyEntry) {
      await client.query(
        `
          INSERT INTO medicine_check_history (
            user_id,
            input_method,
            raw_input,
            medicine_name,
            normalized_drug_name,
            rxnorm_cui,
            ingredient_name,
            therapeutic_class,
            dose,
            frequency,
            risk_score,
            risk_level,
            side_effect_count,
            severe_side_effect_count,
            side_effect_match_count,
            interaction_count,
            max_interaction_severity,
            knowledge_sources
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `,
        [
          userId,
          payload.historyEntry.inputMethod,
          payload.historyEntry.rawInput,
          payload.historyEntry.medicineName,
          payload.historyEntry.normalizedDrugName,
          payload.historyEntry.rxnormCui,
          payload.historyEntry.ingredientName,
          payload.historyEntry.therapeuticClass,
          payload.historyEntry.dose,
          payload.historyEntry.frequency,
          payload.historyEntry.riskScore,
          payload.historyEntry.riskLevel,
          payload.historyEntry.sideEffectCount || 0,
          payload.historyEntry.severeSideEffectCount || 0,
          payload.historyEntry.sideEffectMatchCount || 0,
          payload.historyEntry.interactionCount || 0,
          payload.historyEntry.maxInteractionSeverity || '',
          Array.isArray(payload.historyEntry.knowledgeSources) ? payload.historyEntry.knowledgeSources.join('|') : '',
        ]
      );
    }

    await client.query('COMMIT');

    return {
      ...mapCardRow(card),
      riskFactors,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateCard = async (userId, cardId, payload) => {
  await ensureAnalysisColumns();

  const result = await pool.query(
    `
      UPDATE allergy_cards
      SET
        title = COALESCE($1, title),
        medicine_name = COALESCE($2, medicine_name),
        normalized_drug_name = COALESCE($3, normalized_drug_name),
        rxnorm_cui = COALESCE($4, rxnorm_cui),
        ingredient_name = COALESCE($5, ingredient_name),
        therapeutic_class = COALESCE($6, therapeutic_class),
        status = COALESCE($7, status),
        risk_score = COALESCE($8, risk_score),
        risk_level = COALESCE($9, risk_level),
        side_effect_count = COALESCE($10, side_effect_count),
        severe_side_effect_count = COALESCE($11, severe_side_effect_count),
        side_effect_match_count = COALESCE($12, side_effect_match_count),
        interaction_count = COALESCE($13, interaction_count),
        max_interaction_severity = COALESCE($14, max_interaction_severity),
        knowledge_sources = COALESCE($15, knowledge_sources),
        guidelines_json = COALESCE($16, guidelines_json),
        medication_knowledge_json = COALESCE($17, medication_knowledge_json),
        data_used_json = COALESCE($18, data_used_json),
        explanation = COALESCE($19, explanation),
        recommendation = COALESCE($20, recommendation),
        updated_at = NOW()
      WHERE user_id = $21 AND id = $22
      RETURNING *
    `,
    [
      payload.title,
      payload.medicineName,
      payload.normalizedDrugName,
      payload.rxnormCui,
      payload.ingredientName,
      payload.therapeuticClass,
      payload.status,
      payload.riskScore,
      payload.riskLevel,
      payload.sideEffectCount,
      payload.severeSideEffectCount,
      payload.sideEffectMatchCount,
      payload.interactionCount,
      payload.maxInteractionSeverity,
      Array.isArray(payload.knowledgeSources) ? payload.knowledgeSources.join('|') : null,
      Array.isArray(payload.guidelines) ? JSON.stringify(payload.guidelines) : null,
      payload.medicationKnowledge && typeof payload.medicationKnowledge === 'object'
        ? JSON.stringify(payload.medicationKnowledge)
        : null,
      payload.dataUsed && typeof payload.dataUsed === 'object'
        ? JSON.stringify(payload.dataUsed)
        : null,
      payload.explanation,
      payload.recommendation,
      userId,
      cardId,
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapCardRow(result.rows[0]);
};

const mapHistoryRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  inputMethod: row.input_method,
  rawInput: row.raw_input,
  medicineName: row.medicine_name,
  normalizedDrugName: row.normalized_drug_name,
  rxnormCui: row.rxnorm_cui,
  ingredientName: row.ingredient_name,
  therapeuticClass: row.therapeutic_class,
  dose: row.dose,
  frequency: row.frequency,
  riskScore: row.risk_score,
  riskLevel: row.risk_level,
  sideEffectCount: row.side_effect_count,
  severeSideEffectCount: row.severe_side_effect_count,
  sideEffectMatchCount: row.side_effect_match_count,
  interactionCount: row.interaction_count,
  maxInteractionSeverity: row.max_interaction_severity,
  knowledgeSources: row.knowledge_sources ? row.knowledge_sources.split('|').filter(Boolean) : [],
  createdAt: row.created_at,
});

const listHistory = async (userId) => {
  await ensureAnalysisColumns();

  const result = await pool.query(
    `
      SELECT *
      FROM medicine_check_history
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows.map(mapHistoryRow);
};

/**
 * Prior checks for the same medicine (normalized name, RxCUI, or name prefix) — used to align with user history + public KB context.
 */
const listHistoryMatchesForMedicine = async (userId, { normalizedDrugName, rxnormCui, medicineName }) => {
  await ensureAnalysisColumns();

  const norm = String(normalizedDrugName || '').trim().toLowerCase();
  const rx = String(rxnormCui || '').trim();
  const token = String(medicineName || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)[0] || '';
  const likePrefix = token ? `${token}%` : '';

  const result = await pool.query(
    `
      SELECT *
      FROM medicine_check_history
      WHERE user_id = $1
        AND (
          ($2::text <> '' AND LOWER(TRIM(COALESCE(normalized_drug_name, ''))) = $2)
          OR ($3::text <> '' AND TRIM(COALESCE(rxnorm_cui, '')) = $3)
          OR (
            $4::text <> ''
            AND (
              LOWER(TRIM(medicine_name)) LIKE $4
              OR LOWER(TRIM(COALESCE(normalized_drug_name, ''))) LIKE $4
            )
          )
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 25
    `,
    [userId, norm, rx, likePrefix]
  );

  return result.rows.map(mapHistoryRow);
};

const mapReactionRow = (row) => {
  const meta = decodeFeedbackNotes(row.notes);
  return {
    id: row.id,
    userId: row.user_id,
    medicineCheckId: row.medicine_check_id,
    symptoms: row.symptoms,
    severity: row.severity,
    notes: meta.notes || (meta.v === 0 ? row.notes : ''),
    recordType: meta.recordType || FEEDBACK_RECORD_TYPES.REACTION,
    pharmacistConfirmed: Boolean(meta.pharmacistConfirmed),
    pharmacistRole: meta.pharmacistRole || '',
    allergyCardId: meta.allergyCardId ?? null,
    justification: meta.justification || '',
    createdAt: row.created_at,
  };
};

const listReactionLogs = async (userId) => {
  const result = await pool.query(
    `
      SELECT id, user_id, medicine_check_id, symptoms, severity, notes, created_at
      FROM reaction_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [userId]
  );

  return result.rows.map(mapReactionRow);
};

const createReactionLog = async (userId, payload) => {
  const notesPayload = serializeFeedbackNotes(payload.notes, {
    recordType: payload.recordType || FEEDBACK_RECORD_TYPES.REACTION,
    pharmacistConfirmed: payload.pharmacistConfirmed,
    pharmacistRole: payload.pharmacistRole,
    medicineCheckId: payload.medicineCheckId,
    allergyCardId: payload.allergyCardId,
    consentForTraining: payload.consentForTraining !== false,
    justification: payload.justification,
  });

  const result = await pool.query(
    `
      INSERT INTO reaction_logs (
        user_id,
        medicine_check_id,
        symptoms,
        severity,
        notes
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, medicine_check_id, symptoms, severity, notes, created_at
    `,
    [userId, payload.medicineCheckId, payload.symptoms, payload.severity, notesPayload]
  );

  return mapReactionRow(result.rows[0]);
};

const listConsentedFeedbackForExport = async () => {
  await ensureAllergyProfileColumns();

  const reactions = await pool.query(
    `
      SELECT rl.id, rl.user_id, rl.medicine_check_id, rl.symptoms, rl.severity, rl.notes, rl.created_at
      FROM reaction_logs rl
      INNER JOIN user_allergy_profiles uap ON uap.user_id = rl.user_id
      WHERE uap.feedback_consent_for_training = TRUE
      ORDER BY rl.created_at DESC
    `
  );

  const checks = await pool.query(
    `
      SELECT mch.*
      FROM medicine_check_history mch
      INNER JOIN user_allergy_profiles uap ON uap.user_id = mch.user_id
      WHERE uap.feedback_consent_for_training = TRUE
      ORDER BY mch.created_at DESC
    `
  );

  return {
    reactions: reactions.rows,
    checks: checks.rows,
  };
};

const createClinicalOverrideLog = async (userId, payload) =>
  createReactionLog(userId, {
    medicineCheckId: payload.medicineCheckId,
    allergyCardId: payload.allergyCardId,
    symptoms: payload.symptoms || 'Clinical override documented',
    severity: payload.riskLevel || 'override',
    notes: payload.notes || '',
    recordType: FEEDBACK_RECORD_TYPES.CLINICAL_OVERRIDE,
    pharmacistConfirmed: payload.pharmacistConfirmed,
    pharmacistRole: payload.pharmacistRole,
    consentForTraining: payload.consentForTraining !== false,
    justification: payload.justification,
  });

module.exports = {
  getProfile,
  upsertProfile,
  listQuestionnaireAnswers,
  replaceQuestionnaireAnswers,
  listCards,
  getCardById,
  createCard,
  updateCard,
  listHistory,
  listHistoryMatchesForMedicine,
  listReactionLogs,
  createReactionLog,
  createClinicalOverrideLog,
  listConsentedFeedbackForExport,
};
