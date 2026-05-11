const axios = require('axios');
const { pool } = require('../config/db');
const {
  chunkSearchText,
  chunksWithEmbeddings,
  cosineSimilarity,
  embedText,
  tokenize,
} = require('../data/healthAdviceKnowledge');
const { getLatestDiabetesPrediction } = require('./diabetesPredictionService');
const { getLatestStrokePrediction } = require('./strokePredictionService');
const { getLatestHypertensionPrediction } = require('./hypertensionPredictionService');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const MAX_RETRIEVED_CHUNKS = Number(process.env.HEALTH_ADVICE_MAX_CHUNKS || 6);
const HEALTH_ADVICE_CONVERSATION_TITLE = 'Health Risk Advice';
const SAFETY_NOTE =
  'This is general health guidance, not a medical diagnosis. It does not replace advice from a healthcare professional.';

const RISK_TYPES = ['Diabetes', 'Hypertension', 'Stroke'];
const RISK_KEY = {
  Diabetes: 'diabetes',
  Hypertension: 'hypertension',
  Stroke: 'stroke',
};

const normalizeText = (value) => (value == null ? '' : String(value).trim());

const tableExists = async (tableName) => {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [tableName]
  );
  return result.rows.length > 0;
};

const normalizeRiskType = (value) => {
  const text = normalizeText(value).toLowerCase();
  if (/\b(diabetes|diabetic|blood\s*sugar|glucose)\b/.test(text)) return 'Diabetes';
  if (/\b(hypertension|blood\s*pressure|high\s*bp|\bbp\b|pressure)\b/.test(text)) return 'Hypertension';
  if (/\bstroke\b/.test(text)) return 'Stroke';
  return '';
};

const isHealthAdviceQuestion = (message) => {
  const text = normalizeText(message).toLowerCase();
  if (!text) return false;

  const hasRiskReference = /\b(diabetes|diabetic|sugar|glucose|hypertension|blood\s*pressure|bp|pressure|stroke|risk)\b/.test(text);
  const hasAdviceIntent = /\b(advice|advise|reduce|lower|prevent|prevention|why|what\s+should|how\s+can|how\s+do|caregiver|monitor|guidance|manage|control|healthy|lifestyle)\b/.test(text);

  if (hasRiskReference && hasAdviceIntent) {
    return true;
  }

  const medicationOnly = /\b(medicine|medication|dose|tablet|pill|prescription)\b/.test(text) && !hasRiskReference;
  if (medicationOnly) {
    return false;
  }

  return /\b(can\s+i\s+get|give\s+me|need|want|some)\s+(an?\s+)?(advice|advise|guidance)\b/.test(text) ||
    /\b(what\s+should\s+i\s+do|what\s+can\s+i\s+do|what\s+should\s+my\s+caregiver\s+monitor)\b/.test(text) ||
    /\bhow\s+can\s+i\s+(reduce|lower|improve|manage|control)\b/.test(text) ||
    /\bwhy\s+is\s+(this|it)\s+(high|medium|low)\b/.test(text);
};

const normalizeFactors = (factors) => {
  if (!Array.isArray(factors)) return [];
  return factors.map((factor) => normalizeText(factor)).filter(Boolean);
};

const normalizePrediction = (value) => {
  if (!value || typeof value !== 'object') return null;
  return {
    risk: normalizeText(value.risk || value.riskLevel || value.level),
    riskLevel: normalizeText(value.riskLevel || value.risk || value.level),
    confidence: value.confidence ?? null,
    selectedAlgorithm: normalizeText(value.selectedAlgorithm || value.algorithm),
    factors: normalizeFactors(value.factors),
    summary: normalizeText(value.summary),
  };
};

const normalizePredictionContext = (latestPrediction = {}) => {
  const context = {};
  for (const riskType of RISK_TYPES) {
    const key = RISK_KEY[riskType];
    const prediction = normalizePrediction(latestPrediction[key] || latestPrediction[riskType]);
    if (prediction) {
      context[key] = prediction;
    }
  }
  return context;
};

const mapSavedPrediction = (prediction) => normalizePrediction({
  riskLevel: prediction?.riskLevel,
  confidence: prediction?.confidence,
  selectedAlgorithm: prediction?.selectedAlgorithm,
  factors: prediction?.factors,
  summary: prediction?.summary,
});

const getLatestPredictionContext = async (userId, providedContext = {}) => {
  const context = normalizePredictionContext(providedContext);

  const [diabetes, stroke, hypertension] = await Promise.all([
    context.diabetes ? Promise.resolve(null) : getLatestDiabetesPrediction(userId).catch(() => null),
    context.stroke ? Promise.resolve(null) : getLatestStrokePrediction(userId).catch(() => null),
    context.hypertension ? Promise.resolve(null) : getLatestHypertensionPrediction(userId).catch(() => null),
  ]);

  if (!context.diabetes && diabetes) context.diabetes = mapSavedPrediction(diabetes);
  if (!context.stroke && stroke) context.stroke = mapSavedPrediction(stroke);
  if (!context.hypertension && hypertension) context.hypertension = mapSavedPrediction(hypertension);

  return context;
};

const riskScore = (prediction) => {
  const risk = normalizeText(prediction?.risk || prediction?.riskLevel).toLowerCase();
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  if (risk === 'low') return 1;
  return 0;
};

const detectRiskType = ({ question, requestedRiskType, latestPrediction }) => {
  const explicit = normalizeRiskType(requestedRiskType) || normalizeRiskType(question);
  if (explicit) return explicit;

  let best = '';
  let bestScore = 0;
  for (const riskType of RISK_TYPES) {
    const score = riskScore(latestPrediction?.[RISK_KEY[riskType]]);
    if (score > bestScore) {
      best = riskType;
      bestScore = score;
    }
  }

  return best;
};

const rowToChunk = (row) => ({
  id: row.id,
  sourceName: row.sourceName,
  sourceUrl: row.sourceUrl,
  riskType: row.riskType,
  topic: row.topic,
  contentChunk: row.contentChunk,
  embedding: Array.isArray(row.embedding) ? row.embedding : [],
});

const loadChunks = async (riskType) => {
  const fallbackChunks = () => chunksWithEmbeddings().filter((chunk) => chunk.riskType === riskType || chunk.riskType === 'General');

  if (!(await tableExists('health_advice_chunks').catch(() => false))) {
    return fallbackChunks();
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          source_name AS "sourceName",
          source_url AS "sourceUrl",
          risk_type AS "riskType",
          topic,
          content_chunk AS "contentChunk",
          embedding
        FROM health_advice_chunks
        WHERE risk_type IN ($1, 'General')
        ORDER BY
          CASE WHEN risk_type = $1 THEN 0 ELSE 1 END,
          id ASC
      `,
      [riskType]
    );

    return result.rows.map(rowToChunk);
  } catch (error) {
    return fallbackChunks();
  }
};

const termOverlapScore = (queryText, chunk) => {
  const queryTerms = new Set(tokenize(queryText));
  if (!queryTerms.size) return 0;
  const chunkTerms = new Set(tokenize(chunkSearchText(chunk)));
  let matches = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) matches += 1;
  }
  return matches / queryTerms.size;
};

const retrieveAdviceChunks = async ({ riskType, question, prediction }) => {
  const factors = normalizeFactors(prediction?.factors);
  const queryText = [
    riskType,
    question,
    prediction?.risk || prediction?.riskLevel || '',
    factors.join(' '),
  ].join(' ');
  const queryEmbedding = embedText(queryText);
  const chunks = await loadChunks(riskType);

  const ranked = chunks.map((chunk) => {
    const vectorScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    const overlap = termOverlapScore(queryText, chunk);
    const exactRiskBoost = chunk.riskType === riskType ? 0.1 : 0;
    return {
      ...chunk,
      score: vectorScore * 0.7 + overlap * 0.2 + exactRiskBoost,
    };
  });

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RETRIEVED_CHUNKS)
    .filter((chunk, index) => index < 3 || chunk.score > 0.08);
};

const uniqueSources = (chunks) => {
  const seen = new Set();
  const sources = [];
  for (const chunk of chunks) {
    const key = `${chunk.sourceName}|${chunk.sourceUrl}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({
        name: chunk.sourceName,
        url: chunk.sourceUrl,
      });
    }
  }
  return sources;
};

const buildFallbackAnswer = ({ riskType, prediction, chunks }) => {
  if (!chunks.length) {
    return 'Reliable guidance is not available in the current knowledge base for this question.';
  }

  const risk = normalizeText(prediction?.risk || prediction?.riskLevel);
  const factors = normalizeFactors(prediction?.factors);
  const riskSentence = risk
    ? `Your ${riskType.toLowerCase()} risk is ${risk.toLowerCase()}.`
    : `This answer is about ${riskType.toLowerCase()} risk.`;
  const factorSentence = factors.length
    ? `The main factors noted are ${factors.slice(0, 3).join(', ')}.`
    : '';
  const guidanceTopics = chunks
    .filter((chunk) => chunk.riskType === riskType)
    .slice(0, 3)
    .map((chunk) => chunk.topic.toLowerCase());
  const guidanceSentence = guidanceTopics.length
    ? `Trusted guidance highlights ${guidanceTopics.join(', ')}.`
    : 'Trusted guidance highlights healthy lifestyle steps and professional follow-up.';
  const professionalSentence = /high/i.test(risk)
    ? 'Because the risk or readings may be high, please discuss this with a healthcare professional.'
    : 'Please discuss ongoing high or unusual readings with a healthcare professional.';

  return [riskSentence, factorSentence, guidanceSentence, professionalSentence]
    .filter(Boolean)
    .join(' ');
};

const callMlHealthAdvice = async ({ question, riskType, prediction, chunks, userRole }) => {
  const response = await axios.post(
    `${ML_SERVICE_URL}/assistant/health-advice`,
    {
      question,
      risk_type: riskType,
      prediction,
      retrieved_chunks: chunks.map((chunk) => ({
        source_name: chunk.sourceName,
        source_url: chunk.sourceUrl,
        risk_type: chunk.riskType,
        topic: chunk.topic,
        content_chunk: chunk.contentChunk,
      })),
      user_role: userRole || 'user',
    },
    { timeout: ML_TIMEOUT_MS }
  );
  return response.data || {};
};

const ensureAdviceConversation = async (userId, conversationId = null) => {
  if (conversationId) {
    const found = await pool.query(
      `SELECT id FROM assistant_conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, userId]
    );
    if (found.rows[0]) return found.rows[0].id;
  }

  const latest = await pool.query(
    `
      SELECT id
      FROM assistant_conversations
      WHERE user_id = $1 AND title = $2
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [userId, HEALTH_ADVICE_CONVERSATION_TITLE]
  );
  if (latest.rows[0]) return latest.rows[0].id;

  const created = await pool.query(
    `
      INSERT INTO assistant_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id
    `,
    [userId, HEALTH_ADVICE_CONVERSATION_TITLE]
  );
  return created.rows[0].id;
};

const saveAdviceConversation = async ({ userId, question, answer, sources, chunks, conversationId, latencyMs }) => {
  const finalConversationId = await ensureAdviceConversation(userId, conversationId);
  const rowsReturned = chunks.map((chunk) => ({
    source_name: chunk.sourceName,
    source_url: chunk.sourceUrl,
    risk_type: chunk.riskType,
    topic: chunk.topic,
    content_chunk: chunk.contentChunk,
  }));

  const insertMessage = async (role, content, extra = {}) => {
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
        finalConversationId,
        userId,
        role,
        content,
        '',
        JSON.stringify(extra.rowsReturned || []),
        'health_risk_advice',
        extra.fallbackReason || '',
        extra.latencyMs || null,
      ]
    );
  };

  await insertMessage('user', question);
  await insertMessage('assistant', `${answer}\n\nNote: ${SAFETY_NOTE}`, {
    rowsReturned,
    latencyMs,
  });
  await pool.query(`UPDATE assistant_conversations SET updated_at = NOW() WHERE id = $1`, [finalConversationId]);

  return {
    conversationId: finalConversationId,
    sources,
  };
};

const buildHealthAdviceResponse = async ({
  userId,
  userRole,
  question,
  riskType,
  latestPrediction,
  conversationId,
  saveToHistory = true,
}) => {
  const started = Date.now();
  const cleanQuestion = normalizeText(question);
  if (!cleanQuestion) {
    const err = new Error('question is required');
    err.statusCode = 400;
    throw err;
  }

  if (/\b(heart\s*disease|cardiac|heart\s*attack|coronary)\b/i.test(cleanQuestion) && !normalizeRiskType(cleanQuestion)) {
    const answer = 'Heart disease advice is not available in this phase. I can give trusted guidance for diabetes, high blood pressure, or stroke risk only.';
    const saved = saveToHistory
      ? await saveAdviceConversation({
        userId,
        question: cleanQuestion,
        answer,
        sources: [],
        chunks: [],
        conversationId,
        latencyMs: Date.now() - started,
      })
      : { conversationId, sources: [] };
    return {
      answer,
      riskType: '',
      sources: [],
      safetyNote: SAFETY_NOTE,
      conversationId: saved.conversationId,
      fallback: false,
      followUps: [
        'How can I reduce diabetes risk?',
        'What should I do about high blood pressure?',
        'How can I reduce stroke risk?',
      ],
    };
  }

  const predictionContext = await getLatestPredictionContext(userId, latestPrediction || {});
  const selectedRiskType = detectRiskType({
    question: cleanQuestion,
    requestedRiskType: riskType,
    latestPrediction: predictionContext,
  });

  if (!selectedRiskType) {
    const answer = 'I can give trusted guidance for diabetes, high blood pressure, or stroke risk only.';
    const saved = saveToHistory
      ? await saveAdviceConversation({
        userId,
        question: cleanQuestion,
        answer,
        sources: [],
        chunks: [],
        conversationId,
        latencyMs: Date.now() - started,
      })
      : { conversationId, sources: [] };
    return {
      answer,
      riskType: '',
      sources: [],
      safetyNote: SAFETY_NOTE,
      conversationId: saved.conversationId,
    };
  }

  const prediction = predictionContext[RISK_KEY[selectedRiskType]] || {};
  const chunks = await retrieveAdviceChunks({
    riskType: selectedRiskType,
    question: cleanQuestion,
    prediction,
  });
  const sources = uniqueSources(chunks);

  let answer = '';
  let fallback = false;
  if (chunks.length) {
    try {
      const generated = await callMlHealthAdvice({
        question: cleanQuestion,
        riskType: selectedRiskType,
        prediction,
        chunks,
        userRole,
      });
      answer = normalizeText(generated.answer);
    } catch (error) {
      fallback = true;
    }
  }

  if (!answer) {
    fallback = true;
    answer = buildFallbackAnswer({
      riskType: selectedRiskType,
      prediction,
      chunks,
    });
  }

  const saved = saveToHistory
    ? await saveAdviceConversation({
      userId,
      question: cleanQuestion,
      answer,
      sources,
      chunks,
      conversationId,
      latencyMs: Date.now() - started,
    })
    : { conversationId, sources };

  return {
    answer,
    riskType: selectedRiskType,
    prediction,
    sources: saved.sources || sources,
    safetyNote: SAFETY_NOTE,
    conversationId: saved.conversationId || conversationId || null,
    fallback,
    retrievedChunks: chunks.map((chunk) => ({
      sourceName: chunk.sourceName,
      sourceUrl: chunk.sourceUrl,
      riskType: chunk.riskType,
      topic: chunk.topic,
    })),
    followUps: [
      `How can I reduce this ${selectedRiskType.toLowerCase()} risk?`,
      'Why is this risk high?',
      'What should my caregiver monitor?',
    ],
  };
};

module.exports = {
  SAFETY_NOTE,
  buildHealthAdviceResponse,
  detectRiskType,
  getLatestPredictionContext,
  isHealthAdviceQuestion,
  retrieveAdviceChunks,
};
