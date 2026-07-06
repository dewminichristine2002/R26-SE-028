const axios = require('axios');
const { pool } = require('../config/db');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const DIABETES_CONVERSATION_TITLE = 'Diabetes Risk Assistant';
const PHASE_ONE_ADVICE_MESSAGE =
  'Advice generation will be added in the next phase. For now, I can explain your diabetes risk level and contributing factors.';

const normalizeText = (value) => (value == null ? '' : String(value).trim());

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const safeNumber = (value, fallback = null) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeDiseaseHistory = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const tableExists = async (tableName) => {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [tableName]
  );
  return result.rows.length > 0;
};

const calculateAgeFromDob = (dateOfBirth) => {
  if (!dateOfBirth) {
    return null;
  }

  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }

  return age > 0 ? age : null;
};

const calculateBMI = (heightCm, weightKg) => {
  const h = safeNumber(heightCm, 0);
  const w = safeNumber(weightKg, 0);
  if (!h || !w) {
    return null;
  }

  const meters = h / 100;
  if (meters <= 0) {
    return null;
  }

  return Number((w / (meters * meters)).toFixed(2));
};

const getMedicationAdherence = async (userId) => {
  if (!(await tableExists('medication_status_events'))) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END)::int AS taken,
        SUM(CASE WHEN status IN ('taken', 'not-taken', 'overdose') THEN 1 ELSE 0 END)::int AS total
      FROM medication_status_events
      WHERE user_id = $1
        AND event_time >= NOW() - INTERVAL '30 days'
    `,
    [userId]
  );

  const taken = safeNumber(result.rows[0]?.taken, 0);
  const total = safeNumber(result.rows[0]?.total, 0);
  if (!total) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((taken / total) * 100)));
};

const getLatestDiabetesPrediction = async (userId) => {
  if (!(await tableExists('diabetes_risk_predictions'))) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        risk_type AS "riskType",
        risk_level AS "riskLevel",
        confidence,
        probability,
        selected_algorithm AS "selectedAlgorithm",
        factors,
        summary,
        created_at AS "createdAt"
      FROM diabetes_risk_predictions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const getExistingHealthInputs = async (userId) => {
  const userResult = await pool.query(
    `
      SELECT id, date_of_birth, full_name
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  const allergyExists = await tableExists('user_allergy_profiles');
  const healthExists = await tableExists('user_health_profiles');

  let allergyProfile = null;
  if (allergyExists) {
    const profileResult = await pool.query(
      `
        SELECT age, gender, chronic_diseases_text
        FROM user_allergy_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    allergyProfile = profileResult.rows[0] || null;
  }

  let healthProfile = null;
  if (healthExists) {
    const profileResult = await pool.query(
      `
        SELECT
          age,
          gender,
          blood_sugar AS "bloodSugar",
          systolic_bp AS "systolicBP",
          diastolic_bp AS "diastolicBP",
          height_cm AS "height",
          weight_kg AS "weight",
          smoking_status AS "smokingStatus",
          physical_activity_level AS "physicalActivityLevel",
          family_history AS "familyHistory",
          existing_disease_history AS "existingDiseaseHistory",
          updated_at AS "updatedAt"
        FROM user_health_profiles
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    healthProfile = profileResult.rows[0] || null;
  }

  const medicationAdherence = await getMedicationAdherence(userId);
  const latestPrediction = await getLatestDiabetesPrediction(userId);

  const ageFromUser = calculateAgeFromDob(userResult.rows[0]?.date_of_birth);
  const ageFromAllergy = safeNumber(allergyProfile?.age, null);

  const merged = {
    age: healthProfile?.age || ageFromUser || ageFromAllergy || null,
    gender: healthProfile?.gender || allergyProfile?.gender || null,
    bloodSugar: safeNumber(healthProfile?.bloodSugar, null),
    systolicBP: safeNumber(healthProfile?.systolicBP, null),
    diastolicBP: safeNumber(healthProfile?.diastolicBP, null),
    height: safeNumber(healthProfile?.height, null),
    weight: safeNumber(healthProfile?.weight, null),
    smokingStatus: healthProfile?.smokingStatus || 'No',
    physicalActivityLevel: healthProfile?.physicalActivityLevel || 'Medium',
    familyHistory: healthProfile?.familyHistory || 'No',
    existingDiseaseHistory:
      healthProfile?.existingDiseaseHistory ||
      (allergyProfile?.chronic_diseases_text
        ? allergyProfile.chronic_diseases_text.split(',').map((item) => item.trim()).filter(Boolean)
        : []),
    medicationAdherence,
    bmi: calculateBMI(healthProfile?.height, healthProfile?.weight),
    lastPrediction: latestPrediction,
  };

  return {
    user: {
      id: userResult.rows[0]?.id || userId,
      fullName: userResult.rows[0]?.full_name || '',
    },
    health: merged,
  };
};

const saveOrUpdateHealthValues = async (userId, values) => {
  if (!(await tableExists('user_health_profiles'))) {
    throw new Error('user_health_profiles table is not available. Run database migrations first.');
  }

  const hasExistingDiseaseHistory = hasOwn(values, 'existingDiseaseHistory');
  const existingDiseaseHistory = hasExistingDiseaseHistory
    ? normalizeDiseaseHistory(values.existingDiseaseHistory)
    : [];

  const result = await pool.query(
    `
      INSERT INTO user_health_profiles (
        user_id,
        age,
        gender,
        blood_sugar,
        systolic_bp,
        diastolic_bp,
        height_cm,
        weight_kg,
        smoking_status,
        physical_activity_level,
        family_history,
        existing_disease_history,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        age = COALESCE(EXCLUDED.age, user_health_profiles.age),
        gender = COALESCE(EXCLUDED.gender, user_health_profiles.gender),
        blood_sugar = COALESCE(EXCLUDED.blood_sugar, user_health_profiles.blood_sugar),
        systolic_bp = COALESCE(EXCLUDED.systolic_bp, user_health_profiles.systolic_bp),
        diastolic_bp = COALESCE(EXCLUDED.diastolic_bp, user_health_profiles.diastolic_bp),
        height_cm = COALESCE(EXCLUDED.height_cm, user_health_profiles.height_cm),
        weight_kg = COALESCE(EXCLUDED.weight_kg, user_health_profiles.weight_kg),
        smoking_status = COALESCE(EXCLUDED.smoking_status, user_health_profiles.smoking_status),
        physical_activity_level = COALESCE(EXCLUDED.physical_activity_level, user_health_profiles.physical_activity_level),
        family_history = COALESCE(EXCLUDED.family_history, user_health_profiles.family_history),
        existing_disease_history = CASE
          WHEN $13::boolean THEN EXCLUDED.existing_disease_history
          ELSE user_health_profiles.existing_disease_history
        END,
        updated_at = NOW()
      RETURNING
        age,
        gender,
        blood_sugar AS "bloodSugar",
        systolic_bp AS "systolicBP",
        diastolic_bp AS "diastolicBP",
        height_cm AS "height",
        weight_kg AS "weight",
        smoking_status AS "smokingStatus",
        physical_activity_level AS "physicalActivityLevel",
        family_history AS "familyHistory",
        existing_disease_history AS "existingDiseaseHistory",
        updated_at AS "updatedAt"
    `,
    [
      userId,
      safeNumber(values.age, null),
      normalizeText(values.gender) || null,
      safeNumber(values.bloodSugar, null),
      safeNumber(values.systolicBP, null),
      safeNumber(values.diastolicBP, null),
      safeNumber(values.height, null),
      safeNumber(values.weight, null),
      normalizeText(values.smokingStatus) || null,
      normalizeText(values.physicalActivityLevel) || null,
      normalizeText(values.familyHistory) || null,
      existingDiseaseHistory,
      hasExistingDiseaseHistory,
    ]
  );

  return result.rows[0] || null;
};

const prepareDiabetesPredictionPayload = async (userId, incomingValues = {}) => {
  const existing = await getExistingHealthInputs(userId);
  const base = existing.health || {};

  const existingDiseaseHistory = hasOwn(incomingValues, 'existingDiseaseHistory')
    ? normalizeDiseaseHistory(incomingValues.existingDiseaseHistory)
    : base.existingDiseaseHistory || [];

  const payload = {
    age: safeNumber(incomingValues.age, base.age),
    gender: normalizeText(incomingValues.gender || base.gender) || null,
    bloodSugar: safeNumber(incomingValues.bloodSugar, base.bloodSugar),
    systolicBP: safeNumber(incomingValues.systolicBP, base.systolicBP),
    diastolicBP: safeNumber(incomingValues.diastolicBP, base.diastolicBP),
    height: safeNumber(incomingValues.height, base.height),
    weight: safeNumber(incomingValues.weight, base.weight),
    smokingStatus: normalizeText(incomingValues.smokingStatus || base.smokingStatus) || 'No',
    physicalActivityLevel: normalizeText(incomingValues.physicalActivityLevel || base.physicalActivityLevel) || 'Medium',
    familyHistory: normalizeText(incomingValues.familyHistory || base.familyHistory) || 'No',
    existingDiseaseHistory: existingDiseaseHistory,
    medicationAdherence: safeNumber(
      incomingValues.medicationAdherence,
      base.medicationAdherence
    ),
  };

  payload.bmi = calculateBMI(payload.height, payload.weight);
  return payload;
};

const callDiabetesPredictionService = async (payload) => {
  const response = await axios.post(
    `${ML_SERVICE_URL}/predict/diabetes`,
    payload,
    { timeout: ML_TIMEOUT_MS }
  );

  return response.data;
};

const ensureDiabetesConversation = async (userId, existingConversationId = null) => {
  if (existingConversationId) {
    const found = await pool.query(
      `SELECT id FROM assistant_conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [existingConversationId, userId]
    );

    if (found.rows[0]) {
      return found.rows[0].id;
    }
  }

  const latest = await pool.query(
    `
      SELECT id
      FROM assistant_conversations
      WHERE user_id = $1
        AND title = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId, DIABETES_CONVERSATION_TITLE]
  );

  if (latest.rows[0]) {
    return latest.rows[0].id;
  }

  const created = await pool.query(
    `
      INSERT INTO assistant_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id
    `,
    [userId, DIABETES_CONVERSATION_TITLE]
  );

  return created.rows[0].id;
};

const saveHealthChatHistory = async (
  userId,
  role,
  userMessage,
  assistantResponse,
  metadata = {}
) => {
  const conversationId = await ensureDiabetesConversation(userId, metadata.conversationId || null);

  const addMessage = async (messageRole, content, extra = {}) => {
    await pool.query(
      `
        INSERT INTO assistant_messages (
          conversation_id,
          user_id,
          role,
          content,
          sql_used,
          rows_returned,
          intent,
          fallback_reason,
          latency_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
      `,
      [
        conversationId,
        userId,
        messageRole,
        content,
        '',
        JSON.stringify(extra.rowsReturned || []),
        extra.intent || '',
        extra.fallbackReason || '',
        extra.latencyMs || null,
      ]
    );
  };

  if (normalizeText(userMessage)) {
    await addMessage(role || 'user', userMessage, {
      intent: metadata.intent || 'diabetes_prediction',
      rowsReturned: metadata.userMetadata ? [metadata.userMetadata] : [],
    });
  }

  if (normalizeText(assistantResponse)) {
    await addMessage('assistant', assistantResponse, {
      intent: metadata.intent || 'diabetes_prediction',
      rowsReturned: metadata.result ? [metadata.result] : [],
      fallbackReason: metadata.fallbackReason || '',
      latencyMs: metadata.latencyMs || null,
    });
  }

  await pool.query(
    `UPDATE assistant_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );

  return conversationId;
};

const isAdviceRequest = (message) => {
  const normalized = normalizeText(message).toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    'advice',
    'what should i do',
    'what should we do',
    'treatment',
    'medicine suggestion',
    'medication suggestion',
    'diet plan',
    'food plan',
    'exercise plan',
    'how can',
    'how to cure',
    'how to prevent',
    'reduce',
    'lower',
    'why is',
    'caregiver',
    'monitor',
    'how to reverse',
  ].some((token) => normalized.includes(token));
};

const generateDiabetesSummaryWithLLM = async (result, userRole) => {
  if (!result) {
    return '';
  }

  const factors = Array.isArray(result.factors) && result.factors.length
    ? result.factors.join(', ')
    : 'overall health indicators';

  const confidenceText = safeNumber(result.confidence, null) != null
    ? ` with ${Math.round(safeNumber(result.confidence, 0))}% confidence`
    : '';

  return `Based on the latest values, the system predicts a ${String(result.riskLevel || 'unknown').toLowerCase()} diabetes risk${confidenceText}. The main contributing factors are ${factors}. This is for health risk awareness only and is not a medical diagnosis.`;
};

const saveDiabetesPredictionResult = async (userId, result, inputSnapshot, conversationId = null) => {
  if (!(await tableExists('diabetes_risk_predictions'))) {
    throw new Error('diabetes_risk_predictions table is not available. Run database migrations first.');
  }

  const factors = Array.isArray(result.factors) ? result.factors : [];

  const insert = await pool.query(
    `
      INSERT INTO diabetes_risk_predictions (
        user_id,
        risk_type,
        risk_level,
        confidence,
        probability,
        selected_algorithm,
        factors,
        input_snapshot,
        summary,
        conversation_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
      RETURNING
        id,
        risk_type AS "riskType",
        risk_level AS "riskLevel",
        confidence,
        probability,
        selected_algorithm AS "selectedAlgorithm",
        factors,
        summary,
        created_at AS "createdAt"
    `,
    [
      userId,
      result.riskType || 'Diabetes',
      result.riskLevel || 'Low',
      safeNumber(result.confidence, 0),
      safeNumber(result.probability, null),
      normalizeText(result.selectedAlgorithm) || 'Unknown',
      JSON.stringify(factors),
      JSON.stringify(inputSnapshot || {}),
      normalizeText(result.summary),
      conversationId,
    ]
  );

  return insert.rows[0] || null;
};

const extractHealthValuesFromMessage = (message) => {
  const text = normalizeText(message);
  if (!text) {
    return {};
  }

  const out = {};

  const sugarMatch = text.match(/(?:sugar|blood\s*sugar|glucose)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (sugarMatch) {
    out.bloodSugar = Number(sugarMatch[1]);
  }

  const bpMatch = text.match(/(?:bp|blood\s*pressure)\s*(?:is|=|:)?\s*(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})/i);
  if (bpMatch) {
    out.systolicBP = Number(bpMatch[1]);
    out.diastolicBP = Number(bpMatch[2]);
  }

  const weightMatch =
    text.match(/\b(?:weight|wight|weigh)\b\s*(?:is|to|now|current|new|=|:)?\s*(?:is|now|to|=|:)?\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms)?/i) ||
    text.match(/\b(?:lost|gained|reduced|increased)\b.*?\b(?:weight|wight)\b.*?\b(?:to|now|is)\b\s*(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms)?/i);
  if (weightMatch) {
    out.weight = Number(weightMatch[1]);
  }

  const heightMatch = text.match(/\bheight\b\s*(?:is|to|now|current|new|=|:)?\s*(?:is|now|to|=|:)?\s*(\d+(?:\.\d+)?)\s*(cm|centimeter|centimeters)?/i);
  if (heightMatch) {
    out.height = Number(heightMatch[1]);
  }

  if (/smok(?:e|ing).*\b(no|never|not)\b/i.test(text)) {
    out.smokingStatus = 'No';
  } else if (/smok(?:e|ing).*\b(yes|current|former)\b/i.test(text)) {
    out.smokingStatus = 'Yes';
  }

  if (/physical\s*activity.*\b(low|inactive|sedentary|none)\b/i.test(text)) {
    out.physicalActivityLevel = 'Low';
  } else if (/physical\s*activity.*\b(medium|moderate)\b/i.test(text)) {
    out.physicalActivityLevel = 'Medium';
  } else if (/physical\s*activity.*\b(high|active)\b/i.test(text)) {
    out.physicalActivityLevel = 'High';
  }

  if (/family\s*history.*\b(yes|have|positive)\b/i.test(text)) {
    out.familyHistory = 'Yes';
  } else if (/family\s*history.*\b(no|none|negative)\b/i.test(text)) {
    out.familyHistory = 'No';
  }

  return out;
};

const buildDiabetesResponseWithSummary = async ({
  userId,
  userRole,
  values,
  userMessage,
  conversationId,
}) => {
  const payload = await prepareDiabetesPredictionPayload(userId, values || {});
  await saveOrUpdateHealthValues(userId, payload);

  const started = Date.now();
  const prediction = await callDiabetesPredictionService(payload);

  const result = {
    riskType: prediction.riskType,
    riskLevel: prediction.riskLevel,
    confidence: prediction.confidence,
    selectedAlgorithm: prediction.selectedAlgorithm,
    factors: prediction.factors || [],
    probability: prediction.probability,
  };

  result.summary = await generateDiabetesSummaryWithLLM(result, userRole);

  const finalConversationId = await saveHealthChatHistory(
    userId,
    'user',
    userMessage || 'Check my diabetes risk.',
    result.summary,
    {
      intent: 'diabetes_prediction',
      result,
      conversationId,
      latencyMs: Date.now() - started,
    }
  );

  const saved = await saveDiabetesPredictionResult(userId, result, payload, finalConversationId);

  return {
    ...result,
    savedPredictionId: saved?.id || null,
    conversationId: finalConversationId,
  };
};

module.exports = {
  PHASE_ONE_ADVICE_MESSAGE,
  isAdviceRequest,
  getExistingHealthInputs,
  getMedicationAdherence,
  saveOrUpdateHealthValues,
  calculateBMI,
  prepareDiabetesPredictionPayload,
  callDiabetesPredictionService,
  saveDiabetesPredictionResult,
  generateDiabetesSummaryWithLLM,
  extractHealthValuesFromMessage,
  saveHealthChatHistory,
  getLatestDiabetesPrediction,
  buildDiabetesResponseWithSummary,
};
