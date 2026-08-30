const axios = require('axios');
const { pool } = require('../config/db');
const { ensureMlServiceAvailable } = require('./mlServiceManager');
const {
  calculateBMI,
  extractHealthValuesFromMessage,
  getExistingHealthInputs,
  saveOrUpdateHealthValues,
} = require('./diabetesPredictionService');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const HYPERTENSION_CONVERSATION_TITLE = 'Hypertension Risk Assistant';
const PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE =
  'Advice generation will be added in the next phase. For now, I can explain your hypertension risk level and contributing factors.';

const normalizeText = (value) => (value == null ? '' : String(value).trim());

const safeNumber = (value, fallback = null) => {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const tableExists = async (tableName) => {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [tableName]
  );
  return result.rows.length > 0;
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

const getSnapshotValue = (snapshot, key, fallback = null) => {
  if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)) {
    return snapshot[key];
  }
  return fallback;
};

const getLatestHypertensionPrediction = async (userId) => {
  if (!(await tableExists('hypertension_risk_predictions'))) {
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
        input_snapshot AS "inputSnapshot",
        summary,
        created_at AS "createdAt"
      FROM hypertension_risk_predictions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const getExistingHypertensionInputs = async (userId) => {
  const context = await getExistingHealthInputs(userId);
  const latestPrediction = await getLatestHypertensionPrediction(userId);
  const snapshot = latestPrediction?.inputSnapshot || {};

  return {
    ...context,
    health: {
      ...(context.health || {}),
      lastPrediction: latestPrediction,
      hypertensionDefaults: {
        cholesterol: getSnapshotValue(snapshot, 'cholesterol', ''),
        alcoholIntake: getSnapshotValue(snapshot, 'alcoholIntake', ''),
        stressLevel: getSnapshotValue(snapshot, 'stressLevel', ''),
        saltIntake: getSnapshotValue(snapshot, 'saltIntake', ''),
        sleepDuration: getSnapshotValue(snapshot, 'sleepDuration', ''),
        heartRate: getSnapshotValue(snapshot, 'heartRate', ''),
        ldl: getSnapshotValue(snapshot, 'ldl', ''),
        hdl: getSnapshotValue(snapshot, 'hdl', ''),
        triglycerides: getSnapshotValue(snapshot, 'triglycerides', ''),
        diabetes: getSnapshotValue(snapshot, 'diabetes', 'No'),
        country: getSnapshotValue(snapshot, 'country', ''),
        educationLevel: getSnapshotValue(snapshot, 'educationLevel', ''),
        employmentStatus: getSnapshotValue(snapshot, 'employmentStatus', ''),
      },
    },
  };
};

const prepareHypertensionPredictionPayload = async (userId, incomingValues = {}) => {
  const existing = await getExistingHypertensionInputs(userId);
  const base = existing.health || {};
  const defaults = base.hypertensionDefaults || {};

  const existingDiseaseHistory = Object.prototype.hasOwnProperty.call(incomingValues, 'existingDiseaseHistory')
    ? normalizeDiseaseHistory(incomingValues.existingDiseaseHistory)
    : base.existingDiseaseHistory || [];

  const payload = {
    age: safeNumber(incomingValues.age, base.age),
    gender: normalizeText(incomingValues.gender || base.gender) || null,
    bloodSugar: safeNumber(incomingValues.bloodSugar, base.bloodSugar),
    glucose: safeNumber(incomingValues.glucose, safeNumber(incomingValues.bloodSugar, base.bloodSugar)),
    systolicBP: safeNumber(incomingValues.systolicBP, base.systolicBP),
    diastolicBP: safeNumber(incomingValues.diastolicBP, base.diastolicBP),
    height: safeNumber(incomingValues.height, base.height),
    weight: safeNumber(incomingValues.weight, base.weight),
    smokingStatus: normalizeText(incomingValues.smokingStatus || base.smokingStatus) || 'No',
    physicalActivityLevel: normalizeText(incomingValues.physicalActivityLevel || base.physicalActivityLevel) || 'Medium',
    familyHistory: normalizeText(incomingValues.familyHistory || base.familyHistory) || 'No',
    existingDiseaseHistory,
    diabetes: normalizeText(incomingValues.diabetes || defaults.diabetes) || 'No',
    cholesterol: safeNumber(incomingValues.cholesterol, safeNumber(defaults.cholesterol, null)),
    alcoholIntake: safeNumber(incomingValues.alcoholIntake, safeNumber(defaults.alcoholIntake, null)),
    stressLevel: safeNumber(incomingValues.stressLevel, safeNumber(defaults.stressLevel, null)),
    saltIntake: safeNumber(incomingValues.saltIntake, safeNumber(defaults.saltIntake, null)),
    sleepDuration: safeNumber(incomingValues.sleepDuration, safeNumber(defaults.sleepDuration, null)),
    heartRate: safeNumber(incomingValues.heartRate, safeNumber(defaults.heartRate, null)),
    ldl: safeNumber(incomingValues.ldl, safeNumber(defaults.ldl, null)),
    hdl: safeNumber(incomingValues.hdl, safeNumber(defaults.hdl, null)),
    triglycerides: safeNumber(incomingValues.triglycerides, safeNumber(defaults.triglycerides, null)),
    country: normalizeText(incomingValues.country || defaults.country) || null,
    educationLevel: normalizeText(incomingValues.educationLevel || defaults.educationLevel) || null,
    employmentStatus: normalizeText(incomingValues.employmentStatus || defaults.employmentStatus) || null,
  };

  payload.bmi = calculateBMI(payload.height, payload.weight);
  return payload;
};

const callHypertensionPredictionService = async (payload) => {
  await ensureMlServiceAvailable();
  const response = await axios.post(
    `${ML_SERVICE_URL}/predict/hypertension`,
    payload,
    { timeout: ML_TIMEOUT_MS }
  );

  return response.data;
};

const ensureHypertensionConversation = async (userId, existingConversationId = null) => {
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
    [userId, HYPERTENSION_CONVERSATION_TITLE]
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
    [userId, HYPERTENSION_CONVERSATION_TITLE]
  );

  return created.rows[0].id;
};

const saveHypertensionChatHistory = async (
  userId,
  role,
  userMessage,
  assistantResponse,
  metadata = {}
) => {
  const conversationId = await ensureHypertensionConversation(userId, metadata.conversationId || null);

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
      intent: metadata.intent || 'hypertension_prediction',
      rowsReturned: metadata.userMetadata ? [metadata.userMetadata] : [],
    });
  }

  if (normalizeText(assistantResponse)) {
    await addMessage('assistant', assistantResponse, {
      intent: metadata.intent || 'hypertension_prediction',
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

const generateHypertensionSummaryWithLLM = async (result, userRole) => {
  if (!result) {
    return '';
  }

  const structured = {
    riskType: result.riskType,
    riskLevel: result.riskLevel,
    confidence: result.confidence,
    selectedAlgorithm: result.selectedAlgorithm,
    factors: result.factors,
  };

  const question = [
    'You are an elderly healthcare dashboard assistant.',
    'Use only the provided hypertension prediction result.',
    'Do not diagnose disease.',
    'Do not give treatment or medication advice.',
    'Do not suggest changing or stopping medication.',
    'Explain the prediction in simple language in 2-4 sentences.',
  ].join(' ');

  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/assistant/answer`,
      {
        question,
        sql: '',
        rows: [structured],
        intent: 'hypertension_prediction_explanation',
        user_role: userRole || 'user',
      },
      { timeout: ML_TIMEOUT_MS }
    );

    const answer = normalizeText(response.data?.answer);
    if (answer) {
      return `${answer} This is for health risk awareness only and is not a medical diagnosis.`;
    }
  } catch (error) {
    // Fallback below keeps phase 1 functional even when LLM service is unavailable.
  }

  const factors = Array.isArray(result.factors) && result.factors.length
    ? result.factors.join(', ')
    : 'overall health indicators';

  return `Based on the latest values, the system predicts a ${String(result.riskLevel || 'unknown').toLowerCase()} hypertension risk. The main contributing factors are ${factors}. This is for health risk awareness only and is not a medical diagnosis.`;
};

const saveHypertensionPredictionResult = async (userId, result, inputSnapshot, conversationId = null) => {
  if (!(await tableExists('hypertension_risk_predictions'))) {
    throw new Error('hypertension_risk_predictions table is not available. Run database migrations first.');
  }

  const factors = Array.isArray(result.factors) ? result.factors : [];

  const insert = await pool.query(
    `
      INSERT INTO hypertension_risk_predictions (
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
        input_snapshot AS "inputSnapshot",
        summary,
        created_at AS "createdAt"
    `,
    [
      userId,
      result.riskType || 'Hypertension',
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

const isHypertensionAdviceRequest = (message) => {
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
    'exercise plan',
    'how can',
    'how to cure',
    'how to prevent',
    'reduce',
    'lower',
    'why is',
    'caregiver',
    'monitor',
  ].some((token) => normalized.includes(token));
};

const extractHypertensionValuesFromMessage = (message) => {
  const out = extractHealthValuesFromMessage(message);
  const text = normalizeText(message);

  const cholesterolMatch = text.match(/\bcholesterol\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (cholesterolMatch) out.cholesterol = Number(cholesterolMatch[1]);

  const stressMatch = text.match(/\bstress(?:\s*level)?\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (stressMatch) out.stressLevel = Number(stressMatch[1]);

  const saltMatch = text.match(/\bsalt(?:\s*intake)?\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (saltMatch) out.saltIntake = Number(saltMatch[1]);

  const sleepMatch = text.match(/\bsleep(?:\s*duration)?\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:hours|hrs|h)?/i);
  if (sleepMatch) out.sleepDuration = Number(sleepMatch[1]);

  const heartRateMatch = text.match(/\b(?:heart\s*rate|pulse)\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (heartRateMatch) out.heartRate = Number(heartRateMatch[1]);

  const alcoholMatch = text.match(/\balcohol(?:\s*intake)?\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (alcoholMatch) out.alcoholIntake = Number(alcoholMatch[1]);

  const ldlMatch = text.match(/\bldl\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (ldlMatch) out.ldl = Number(ldlMatch[1]);

  const hdlMatch = text.match(/\bhdl\b\s*(?:is|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (hdlMatch) out.hdl = Number(hdlMatch[1]);

  const triglyceridesMatch = text.match(/\btriglycerides\b\s*(?:is|are|now|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (triglyceridesMatch) out.triglycerides = Number(triglyceridesMatch[1]);

  if (/\b(former|past|ex)\s+smok(?:e|er|ing)?\b|\bused\s+to\s+smoke\b/i.test(text)) {
    out.smokingStatus = 'Former';
  } else if (/\b(current|yes|still)\s+smok(?:e|er|ing)?\b|\bsmok(?:e|ing)\b.*\b(current|yes|still)\b/i.test(text)) {
    out.smokingStatus = 'Yes';
  } else if (/\b(?:never|no|not)\s+smok(?:e|er|ing)?\b|\bsmok(?:e|ing)\b.*\b(no|never|not)\b/i.test(text)) {
    out.smokingStatus = 'No';
  }

  if (/diabetes.*\b(yes|have|positive)\b|\b(have|has)\s+diabetes\b/i.test(text)) {
    out.diabetes = 'Yes';
  } else if (/diabetes.*\b(no|none|negative)\b/i.test(text)) {
    out.diabetes = 'No';
  }

  if (/hypertension|high\s*blood\s*pressure|htn/i.test(text)) {
    const history = normalizeDiseaseHistory(out.existingDiseaseHistory);
    if (!history.some((item) => /hypertension|blood pressure|htn/i.test(item))) {
      out.existingDiseaseHistory = [...history, 'hypertension'];
    }
  }

  return out;
};

const buildHypertensionResponseWithSummary = async ({
  userId,
  userRole,
  values,
  userMessage,
  conversationId,
}) => {
  const payload = await prepareHypertensionPredictionPayload(userId, values || {});
  await saveOrUpdateHealthValues(userId, payload);

  const started = Date.now();
  const prediction = await callHypertensionPredictionService(payload);

  const result = {
    riskType: prediction.riskType,
    riskLevel: prediction.riskLevel,
    confidence: prediction.confidence,
    selectedAlgorithm: prediction.selectedAlgorithm,
    factors: prediction.factors || [],
    probability: prediction.probability,
  };

  result.summary = await generateHypertensionSummaryWithLLM(result, userRole);

  const finalConversationId = await saveHypertensionChatHistory(
    userId,
    'user',
    userMessage || 'Check my hypertension risk.',
    result.summary,
    {
      intent: 'hypertension_prediction',
      result,
      conversationId,
      latencyMs: Date.now() - started,
    }
  );

  const saved = await saveHypertensionPredictionResult(userId, result, payload, finalConversationId);

  return {
    ...result,
    savedPredictionId: saved?.id || null,
    conversationId: finalConversationId,
  };
};

module.exports = {
  PHASE_ONE_HYPERTENSION_ADVICE_MESSAGE,
  isHypertensionAdviceRequest,
  getExistingHypertensionInputs,
  prepareHypertensionPredictionPayload,
  callHypertensionPredictionService,
  saveHypertensionPredictionResult,
  generateHypertensionSummaryWithLLM,
  extractHypertensionValuesFromMessage,
  saveHypertensionChatHistory,
  getLatestHypertensionPrediction,
  buildHypertensionResponseWithSummary,
};
