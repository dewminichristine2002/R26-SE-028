const { pool } = require('../config/db');

let allergyProfileColumnsEnsured = false;
let analysisColumnsEnsured = false;

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
  allergyProfileColumnsEnsured = true;
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
  profileCompleted: Boolean(row.profile_completed),
  reactionSymptomsText: row.reaction_symptoms_text || '',
  suspectedMedicineNamesText: row.suspected_medicine_names_text || '',
  avoidedMedicinesText: row.avoided_medicines_text || '',
  antibioticPainkillerReaction: row.antibiotic_painkiller_reaction || '',
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

    return mapProfileRow(inserted.rows[0]);
  }

  return mapProfileRow(result.rows[0]);
};

const upsertProfile = async (userId, payload) => {
  await ensureAllergyProfileColumns();

  const result = await pool.query(
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
        profile_completed,
        reaction_symptoms_text,
        suspected_medicine_names_text,
        avoided_medicines_text,
        antibiotic_painkiller_reaction,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
        profile_completed = EXCLUDED.profile_completed,
        reaction_symptoms_text = EXCLUDED.reaction_symptoms_text,
        suspected_medicine_names_text = EXCLUDED.suspected_medicine_names_text,
        avoided_medicines_text = EXCLUDED.avoided_medicines_text,
        antibiotic_painkiller_reaction = EXCLUDED.antibiotic_painkiller_reaction,
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
      payload.currentMedicationsText,
      payload.emergencyContact,
      payload.caregiverDetails,
      payload.profileCompleted,
      payload.reactionSymptomsText,
      payload.suspectedMedicineNamesText,
      payload.avoidedMedicinesText,
      payload.antibioticPainkillerReaction,
    ]
  );

  return mapProfileRow(result.rows[0]);
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
          explanation,
          recommendation,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
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
        payload.explanation,
        payload.recommendation,
      ]
    );

    const card = insertedCard.rows[0];
    const riskFactors = [];

    for (const factor of payload.riskFactors) {
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
        [card.id, factor.factorType, factor.factorLabel, factor.severity, factor.score]
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
        explanation = COALESCE($16, explanation),
        recommendation = COALESCE($17, recommendation),
        updated_at = NOW()
      WHERE user_id = $18 AND id = $19
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

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    medicineCheckId: row.medicine_check_id,
    symptoms: row.symptoms,
    severity: row.severity,
    notes: row.notes,
    createdAt: row.created_at,
  }));
};

const createReactionLog = async (userId, payload) => {
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
    [userId, payload.medicineCheckId, payload.symptoms, payload.severity, payload.notes]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    medicineCheckId: row.medicine_check_id,
    symptoms: row.symptoms,
    severity: row.severity,
    notes: row.notes,
    createdAt: row.created_at,
  };
};

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
};
