const { pool } = require('../config/db');

let allergyProfileColumnsEnsured = false;

const ensureAllergyProfileColumns = async () => {
  if (allergyProfileColumnsEnsured) {
    return;
  }

  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS age TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE user_allergy_profiles ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT ''`);
  allergyProfileColumnsEnsured = true;
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCardRow = (row) => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  medicineName: row.medicine_name,
  normalizedDrugName: row.normalized_drug_name,
  status: row.status,
  riskScore: row.risk_score,
  riskLevel: row.risk_level,
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
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
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
          status,
          risk_score,
          risk_level,
          explanation,
          recommendation,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `,
      [
        userId,
        payload.title,
        payload.medicineName,
        payload.normalizedDrugName,
        payload.status,
        payload.riskScore,
        payload.riskLevel,
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
            dose,
            frequency,
            risk_score,
            risk_level
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          userId,
          payload.historyEntry.inputMethod,
          payload.historyEntry.rawInput,
          payload.historyEntry.medicineName,
          payload.historyEntry.normalizedDrugName,
          payload.historyEntry.dose,
          payload.historyEntry.frequency,
          payload.historyEntry.riskScore,
          payload.historyEntry.riskLevel,
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
  const result = await pool.query(
    `
      UPDATE allergy_cards
      SET
        title = COALESCE($1, title),
        medicine_name = COALESCE($2, medicine_name),
        normalized_drug_name = COALESCE($3, normalized_drug_name),
        status = COALESCE($4, status),
        risk_score = COALESCE($5, risk_score),
        risk_level = COALESCE($6, risk_level),
        explanation = COALESCE($7, explanation),
        recommendation = COALESCE($8, recommendation),
        updated_at = NOW()
      WHERE user_id = $9 AND id = $10
      RETURNING *
    `,
    [
      payload.title,
      payload.medicineName,
      payload.normalizedDrugName,
      payload.status,
      payload.riskScore,
      payload.riskLevel,
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

const listHistory = async (userId) => {
  const result = await pool.query(
    `
      SELECT *
      FROM medicine_check_history
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    inputMethod: row.input_method,
    rawInput: row.raw_input,
    medicineName: row.medicine_name,
    normalizedDrugName: row.normalized_drug_name,
    dose: row.dose,
    frequency: row.frequency,
    riskScore: row.risk_score,
    riskLevel: row.risk_level,
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
  createReactionLog,
};
