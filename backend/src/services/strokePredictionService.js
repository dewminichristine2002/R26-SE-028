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
const STROKE_CONVERSATION_TITLE = 'Stroke Risk Assistant';
const PHASE_ONE_STROKE_ADVICE_MESSAGE =
  'Advice generation will be added in the next phase. For now, I can explain your stroke risk level and contributing factors.';

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

const getLatestStrokePrediction = async (userId) => {
  if (!(await tableExists('stroke_risk_predictions'))) {
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
      FROM stroke_risk_predictions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] || null;
};

const getExistingStrokeInputs = async (userId) => {
  const context = await getExistingHealthInputs(userId);
  const latestPrediction = await getLatestStrokePrediction(userId);

  return {
    ...context,
    health: {
      ...(context.health || {}),
      lastPrediction: latestPrediction,
      strokeDefaults: {
        everMarried: 'Yes',
        workType: 'Private',
        residenceType: 'Urban',
      },
    },
  };
};

const prepareStrokePredictionPayload = async (userId, incomingValues = {}) => {
  const existing = await getExistingStrokeInputs(userId);
  const base = existing.health || {};

  const existingDiseaseHistory = Object.prototype.hasOwnProperty.call(incomingValues, 'existingDiseaseHistory')
    ? normalizeDiseaseHistory(incomingValues.existingDiseaseHistory)
    : base.existingDiseaseHistory || [];

  const payload = {
    age: safeNumber(incomingValues.age, base.age),
    gender: normalizeText(incomingValues.gender || base.gender) || null,
    bloodSugar: safeNumber(incomingValues.bloodSugar, base.bloodSugar),
    avgGlucoseLevel: safeNumber(
      incomingValues.avgGlucoseLevel,
      safeNumber(incomingValues.bloodSugar, base.bloodSugar)
    ),
    systolicBP: safeNumber(incomingValues.systolicBP, base.systolicBP),
    diastolicBP: safeNumber(incomingValues.diastolicBP, base.diastolicBP),
    height: safeNumber(incomingValues.height, base.height),
    weight: safeNumber(incomingValues.weight, base.weight),
    smokingStatus: normalizeText(incomingValues.smokingStatus || base.smokingStatus) || 'No',
    existingDiseaseHistory,
    hypertension: incomingValues.hypertension ?? null,
    heartDisease: incomingValues.heartDisease ?? null,
    everMarried: normalizeText(incomingValues.everMarried) || base.strokeDefaults?.everMarried || 'Yes',
    workType: normalizeText(incomingValues.workType) || base.strokeDefaults?.workType || 'Private',
    residenceType: normalizeText(incomingValues.residenceType) || base.strokeDefaults?.residenceType || 'Urban',
  };

  payload.bmi = calculateBMI(payload.height, payload.weight);
  return payload;
};

const callStrokePredictionService = async (payload) => {
  await ensureMlServiceAvailable();
  const response = await axios.post(
    `${ML_SERVICE_URL}/predict/stroke`,
    payload,
    { timeout: ML_TIMEOUT_MS }
  );

  return response.data;
};

const ensureStrokeConversation = async (userId, existingConversationId = null) => {
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
    [userId, STROKE_CONVERSATION_TITLE]
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
    [userId, STROKE_CONVERSATION_TITLE]
  );

  return created.rows[0].id;
};

const saveStrokeChatHistory = async (
  userId,
  role,
  userMessage,
  assistantResponse,
  metadata = {}
) => {
  const conversationId = await ensureStrokeConversation(userId, metadata.conversationId || null);

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
      intent: metadata.intent || 'stroke_prediction',
      rowsReturned: metadata.userMetadata ? [metadata.userMetadata] : [],
    });
  }

  if (normalizeText(assistantResponse)) {
    await addMessage('assistant', assistantResponse, {
      intent: metadata.intent || 'stroke_prediction',
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

const generateStrokeSummaryWithLLM = async (result, userRole) => {
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
    'Use only the provided stroke prediction result.',
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
        intent: 'stroke_prediction_explanation',
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

  return `Based on the latest values, the system predicts a ${String(result.riskLevel || 'unknown').toLowerCase()} stroke risk. The main contributing factors are ${factors}. This is for health risk awareness only and is not a medical diagnosis.`;
};

const saveStrokePredictionResult = async (userId, result, inputSnapshot, conversationId = null) => {
  if (!(await tableExists('stroke_risk_predictions'))) {
    throw new Error('stroke_risk_predictions table is not available. Run database migrations first.');
  }

  const factors = Array.isArray(result.factors) ? result.factors : [];

  const insert = await pool.query(
    `
      INSERT INTO stroke_risk_predictions (
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
      result.riskType || 'Stroke',
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

const isStrokeAdviceRequest = (message) => {
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

const extractStrokeValuesFromMessage = (message) => {
  const out = extractHealthValuesFromMessage(message);
  const text = normalizeText(message);

  if (/heart\s*(disease|attack)|cardiac|cad/i.test(text)) {
    out.heartDisease = 'Yes';
    const history = normalizeDiseaseHistory(out.existingDiseaseHistory);
    if (!history.some((item) => /heart|cardiac|cad/i.test(item))) {
      out.existingDiseaseHistory = [...history, 'heart disease'];
    }
  }

  if (/hypertension|high\s*blood\s*pressure|htn/i.test(text)) {
    out.hypertension = 'Yes';
    const history = normalizeDiseaseHistory(out.existingDiseaseHistory);
    if (!history.some((item) => /hypertension|blood pressure|htn/i.test(item))) {
      out.existingDiseaseHistory = [...history, 'hypertension'];
    }
  }

  if (/stroke\s*(history|before|previous|past)/i.test(text)) {
    const history = normalizeDiseaseHistory(out.existingDiseaseHistory);
    out.existingDiseaseHistory = [...history, 'previous stroke'];
  }

  return out;
};

const buildStrokeResponseWithSummary = async ({
  userId,
  userRole,
  values,
  userMessage,
  conversationId,
}) => {
  const payload = await prepareStrokePredictionPayload(userId, values || {});
  await saveOrUpdateHealthValues(userId, payload);

  const started = Date.now();
  const prediction = await callStrokePredictionService(payload);

  const result = {
    riskType: prediction.riskType,
    riskLevel: prediction.riskLevel,
    confidence: prediction.confidence,
    selectedAlgorithm: prediction.selectedAlgorithm,
    factors: prediction.factors || [],
    probability: prediction.probability,
  };

  result.summary = await generateStrokeSummaryWithLLM(result, userRole);

  const finalConversationId = await saveStrokeChatHistory(
    userId,
    'user',
    userMessage || 'Check my stroke risk.',
    result.summary,
    {
      intent: 'stroke_prediction',
      result,
      conversationId,
      latencyMs: Date.now() - started,
    }
  );

  const saved = await saveStrokePredictionResult(userId, result, payload, finalConversationId);

  return {
    ...result,
    savedPredictionId: saved?.id || null,
    conversationId: finalConversationId,
  };
};

module.exports = {
  PHASE_ONE_STROKE_ADVICE_MESSAGE,
  isStrokeAdviceRequest,
  getExistingStrokeInputs,
  prepareStrokePredictionPayload,
  callStrokePredictionService,
  saveStrokePredictionResult,
  generateStrokeSummaryWithLLM,
  extractStrokeValuesFromMessage,
  saveStrokeChatHistory,
  getLatestStrokePrediction,
  buildStrokeResponseWithSummary,
};
