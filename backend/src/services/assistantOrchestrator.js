/**
 * The "brain" of the conversational dashboard.
 *
 * Round-trip:
 *    user query
 *      \u2192 ml-service /assistant/nl2sql  (Llama 3, schema-aware)
 *      \u2192 sqlValidator                  (safety wall)
 *      \u2192 PostgreSQL  ($1 = current user id)
 *      \u2192 ml-service /assistant/answer  (Llama 3 RAG conversational reply)
 *      \u2192 persisted in assistant_messages
 *      \u2192 returned to caller
 */

const axios = require('axios');
const { pool } = require('../config/db');
const { validateAndPrepareSql } = require('./sqlValidator');
const { buildPromptDigest } = require('../data/schemaDescription');
const {
  buildDiabetesResponseWithSummary,
  extractHealthValuesFromMessage,
} = require('./diabetesPredictionService');
const {
  buildStrokeResponseWithSummary,
  extractStrokeValuesFromMessage,
} = require('./strokePredictionService');
const {
  buildHypertensionResponseWithSummary,
  extractHypertensionValuesFromMessage,
} = require('./hypertensionPredictionService');
const {
  buildHealthAdviceResponse,
  isHealthAdviceQuestion,
} = require('./healthAdviceService');
const { analyzeCheckIn } = require('./emotionAnalysisService');
const { selectIntervention } = require('./interventionService');
const { evaluateAlertNeed } = require('./alertService');
const { calculateRiskLevel } = require('../utils/riskCalculator');
const {
  buildConfirmationAnswer,
  executeAgenticAction,
  isCancelMessage,
  isConfirmMessage,
  parseAgenticAction,
} = require('./assistantAgenticActionService');
const {
  createCheckInRecord,
  getNegativeMoodCount,
} = require('../repositories/sessionRepository');
const { getNextActivityByEmotion } = require('../repositories/activityRepository');
const { getProfileByElderId } = require('../repositories/profileRepository');
const { createAlertsForCaregivers } = require('../repositories/alertRepository');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const STATEMENT_TIMEOUT_MS = Number(process.env.ASSISTANT_SQL_TIMEOUT_MS || 5000);
const MAX_ROWS_RETURNED = Number(process.env.ASSISTANT_MAX_ROWS || 100);
const MAX_HISTORY_MESSAGES = 6;
const ASSISTANT_RESPONSE_CACHE_TTL_MS = Number(process.env.ASSISTANT_RESPONSE_CACHE_TTL_MS || 180000);
const assistantResponseCache = new Map();

const normalizeAssistantQuestion = (value = '') => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const buildAssistantCacheKey = (userId, role, question) => {
  const safeUserId = String(userId ?? 'anonymous');
  const safeRole = String(role || 'user').toLowerCase();
  const safeQuestion = normalizeAssistantQuestion(question);
  return `${safeUserId}|${safeRole}|${safeQuestion}`;
};

const buildConversationTitle = (message = '') => {
  const raw = String(message || '').trim();
  if (!raw) {
    return 'New conversation';
  }

  const cleaned = raw.replace(/\s+/g, ' ');
  const maxChars = 80;

  if (cleaned.length <= maxChars) {
    return cleaned.trim();
  }

  const base = cleaned.slice(0, maxChars).trim();
  const lastSpace = base.lastIndexOf(' ');
  const candidate = lastSpace > 18 ? base.slice(0, lastSpace).trim() : base;
  return `${candidate}...`;
};

const getCachedAssistantResponse = (userId, role, question) => {
  const key = buildAssistantCacheKey(userId, role, question);
  const entry = assistantResponseCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    assistantResponseCache.delete(key);
    return null;
  }

  return entry.response;
};

const setCachedAssistantResponse = (userId, role, question, response) => {
  const key = buildAssistantCacheKey(userId, role, question);
  assistantResponseCache.set(key, {
    expiresAt: Date.now() + ASSISTANT_RESPONSE_CACHE_TTL_MS,
    response,
  });
};

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'authorization',
  'caregiver_phone',
  'phone',
  'email',
  'caregiver_email',
]);

const redactValue = (key, value) => {
  if (value == null) {
    return value;
  }
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
    return '[redacted]';
  }
  return value;
};

const redactRowsForLLM = (rows) => {
  if (!Array.isArray(rows)) {
    return rows;
  }
  return rows.map((row) => {
    if (row == null || typeof row !== 'object') {
      return row;
    }
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = redactValue(k, v);
    }
    return out;
  });
};

const ensureConversation = async (userId, conversationId, initialQuestion = '') => {
  if (conversationId) {
    const existing = await pool.query(
      `SELECT id, title FROM assistant_conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, userId]
    );
    if (existing.rows.length > 0) {
      const existingRow = existing.rows[0];
      const currentTitle = String(existingRow.title || '').trim();
      if (currentTitle && currentTitle !== 'New conversation') {
        return existingRow.id;
      }
      const firstTitle = buildConversationTitle(initialQuestion || '');
      if (firstTitle && firstTitle !== 'New conversation') {
        await pool.query(
          `UPDATE assistant_conversations SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
          [firstTitle, existingRow.id, userId]
        );
      }
      return existingRow.id;
    }
  }

  const created = await pool.query(
    `
      INSERT INTO assistant_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id
    `,
    [userId, buildConversationTitle(initialQuestion)]
  );
  return created.rows[0].id;
};

const getConversationHint = async (userId, conversationId) => {
  if (!conversationId) {
    return '';
  }

  const result = await pool.query(
    `
      SELECT title
      FROM assistant_conversations
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [conversationId, userId]
  );

  const title = String(result.rows[0]?.title || '').toLowerCase();
  if (/\bstroke\b/.test(title)) {
    return 'Stroke';
  }
  if (/\b(hypertension|blood\s*pressure|\bbp\b)\b/.test(title)) {
    return 'Hypertension';
  }
  if (/\b(diabetes|diabetic|blood\s*sugar|glucose)\b/.test(title)) {
    return 'Diabetes';
  }

  return '';
};

const recentMessagesForContext = async (conversationId) => {
  const result = await pool.query(
    `
      SELECT role, content
      FROM assistant_messages
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [conversationId, MAX_HISTORY_MESSAGES]
  );

  return result.rows.reverse().map((row) => ({
    role: row.role,
    content: row.content,
  }));
};

const appendMessage = async ({ conversationId, userId, role, content, sqlUsed = '', rowsReturned = [], intent = '', fallbackReason = '', latencyMs = null }) => {
  const truncatedRows = Array.isArray(rowsReturned) ? rowsReturned.slice(0, MAX_ROWS_RETURNED) : [];

  await pool.query(
    `
      INSERT INTO assistant_messages
        (conversation_id, user_id, role, content, sql_used, rows_returned, intent, fallback_reason, latency_ms)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
    `,
    [
      conversationId,
      userId,
      role,
      String(content || ''),
      String(sqlUsed || ''),
      JSON.stringify(truncatedRows),
      String(intent || ''),
      String(fallbackReason || ''),
      latencyMs,
    ]
  );

  await pool.query(
    `UPDATE assistant_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversationId]
  );
};

const getLatestPendingAgenticAction = async (conversationId, userId) => {
  if (!conversationId) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT intent, rows_returned
      FROM assistant_messages
      WHERE conversation_id = $1
        AND user_id = $2
        AND role = 'assistant'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [conversationId, userId]
  );

  const latest = result.rows[0];
  if (latest?.intent !== 'agentic_action_confirmation') {
    return null;
  }

  const rowsReturned = latest.rows_returned;
  const rows = typeof rowsReturned === 'string'
    ? JSON.parse(rowsReturned || '[]')
    : rowsReturned;
  const pending = Array.isArray(rows)
    ? rows.find((row) => row?.type === 'pending_agentic_action' && row.action)
    : null;

  return pending?.action || null;
};

const callMlNl2sql = async (payload) => {
  const response = await axios.post(`${ML_SERVICE_URL}/assistant/nl2sql`, payload, {
    timeout: ML_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data || {};
};

const callMlAnswer = async (payload) => {
  const response = await axios.post(`${ML_SERVICE_URL}/assistant/answer`, payload, {
    timeout: ML_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data || {};
};

const runUserScopedQuery = async (sql, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query({ text: sql, values: [userId] });
    await client.query('COMMIT');
    return result.rows.slice(0, MAX_ROWS_RETURNED);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const isDiabetesAssistantRequest = (message, extractedValues) => {
  if (Object.keys(extractedValues || {}).length > 0) {
    return true;
  }

  const normalized = String(message || '').toLowerCase();
  return /\b(diabetes|diabetic|blood\s*sugar|glucose)\b/.test(normalized) &&
    /\b(risk|predict|prediction|check|update|changed|new|now)\b/.test(normalized);
};

const isStrokeAssistantRequest = (message) => {
  const normalized = String(message || '').toLowerCase();
  return /\bstroke\b/.test(normalized) &&
    /\b(risk|predict|prediction|check|update|changed|new|now)\b/.test(normalized);
};

const isHypertensionAssistantRequest = (message, extractedValues) => {
  const normalized = String(message || '').toLowerCase();
  if (/\b(hypertension|blood\s*pressure|bp|systolic|diastolic)\b/.test(normalized)) {
    return true;
  }
  return Object.prototype.hasOwnProperty.call(extractedValues || {}, 'systolicBP') ||
    Object.prototype.hasOwnProperty.call(extractedValues || {}, 'diastolicBP') ||
    Object.prototype.hasOwnProperty.call(extractedValues || {}, 'cholesterol');
};

const normalizeMessageText = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const isEmotionalSupportAgentRequest = (message) => {
  const text = normalizeMessageText(message).toLowerCase();
  if (!text) {
    return false;
  }

  const caregiverSubjectPattern =
    /\b(my\s+(?:mother|mom|father|parent)|mother's|mom's|father's|parent's)\b/i;
  const caregiverWellbeingQuestion =
    /\b(how\s+is|how\s+was|how\s+has|how\s+have|tell\s+me\s+about|show|check|what's|whats)\b[\s\S]{0,40}\b(my\s+(?:mother|mom|father|parent)|mother's|mom's|father's|parent's)\b[\s\S]{0,30}\b(these\s+days|recently|lately|today|now|more|mood|emotion|feelings?|feeling|stress|lonely|loneliness)\b/i.test(text);

  if (caregiverSubjectPattern.test(text) && /\b(these\s+days|recently|lately|today|now)\b/i.test(text) && /\b(mood|emotion|feelings?|feeling|stress|lonely|loneliness|more)\b/i.test(text)) {
    return true;
  }

  if (caregiverWellbeingQuestion) {
    return true;
  }

  const historicalMoodQuestion =
    /\b(how\s+has|how\s+was|trend|summary|history|recently|last\s+week|show|tell\s+me\s+about)\b[\s\S]{0,40}\b(mood|emotion|stress|lonely|loneliness)\b/i.test(text);
  if (historicalMoodQuestion && !/\b(i\s+feel|i\s+am\s+feeling|i'm\s+feeling|my\s+elder\s+feels|my\s+parent\s+feels)\b/i.test(text)) {
    return false;
  }

  const hasCurrentFeeling =
    /\b(i\s+feel|i\s+am\s+feeling|i'm\s+feeling|feeling|i\s+am|i'm|my\s+elder\s+feels|my\s+parent\s+feels|my\s+mother\s+feels|my\s+father\s+feels)\b/i.test(text);
  const hasSupportIntent =
    /\b(mood\s*check|check\s*in|emotional\s+support|support\s+me|need\s+support|cognitive\s+support|memory\s+activity|calm\s+me|help\s+me\s+calm)\b/i.test(text);
  const hasEmotionSignal =
    /\b(sad|lonely|alone|anxious|worried|scared|angry|upset|confused|forgetful|forgot|cannot\s+remember|stressed|stress|happy|neutral|down|tired)\b/i.test(text);

  return (hasCurrentFeeling && hasEmotionSignal) || (hasSupportIntent && (hasEmotionSignal || /\bcheck\s*in|support\b/i.test(text)));
};

const runEmotionalSupportCheckIn = async ({ userId, message }) => {
  const analysis = await analyzeCheckIn({
    elderId: userId,
    inputMode: 'text',
    checkInType: 'triggered',
    text: message,
  });
  const negativeMoodCount7d = await getNegativeMoodCount(userId, 7);
  const riskLevel = calculateRiskLevel({
    detectedEmotion: analysis.detectedEmotion,
    lonelinessScore: analysis.lonelinessScore,
    stressScore: analysis.stressScore,
    negativeMoodCount7d,
  });
  const [activity, recommendation, profile] = await Promise.all([
    getNextActivityByEmotion(analysis.detectedEmotion).catch(() => null),
    selectIntervention({ detectedEmotion: analysis.detectedEmotion, riskLevel }),
    getProfileByElderId(userId).catch(() => null),
  ]);
  const contextSnapshot = {
    missedMedicationCount7d: 0,
    previousNegativeMoodCount7d: negativeMoodCount7d,
    lastDetectedEmotion: null,
    source: 'assistant_agent',
  };
  const created = await createCheckInRecord({
    elderId: userId,
    inputMode: 'text',
    checkInType: 'triggered',
    text: message,
    analysis,
    riskLevel,
    contextSnapshot,
    intervention: recommendation.intervention,
    activity,
  });

  let createdAlerts = [];
  try {
    const alertPayload = evaluateAlertNeed({
      elderId: userId,
      caregiverId: null,
      detectedEmotion: analysis.detectedEmotion,
      riskLevel,
      negativeMoodCount7d,
    });
    createdAlerts = await createAlertsForCaregivers({
      elderId: userId,
      caregiverIds: profile?.caregiverIds || [],
      sessionId: created.session.id,
      alertPayload,
      explanation: {
        negativeMoodCount7d,
        detectedEmotion: analysis.detectedEmotion,
        stressScore: analysis.stressScore,
        lonelinessScore: analysis.lonelinessScore,
        concernSummary: alertPayload?.concernSummary || null,
      },
    });
  } catch (error) {
    createdAlerts = [];
  }

  return {
    sessionId: created.session.id,
    detectedEmotion: analysis.detectedEmotion,
    confidence: analysis.confidence,
    scores: {
      sentimentScore: analysis.sentimentScore,
      stressScore: analysis.stressScore,
      lonelinessScore: analysis.lonelinessScore,
    },
    riskLevel,
    chatbotReply: created.intervention.responseText,
    intervention: created.intervention,
    activity,
    alertsCreated: createdAlerts.length,
  };
};

const buildEmotionalSupportAnswer = (result, role) => {
  const subject = String(role || '').toLowerCase() === 'caregiver' ? 'your elder' : 'you';
  const detected = result.detectedEmotion || 'neutral';
  const riskText = result.riskLevel ? ` with ${result.riskLevel} support risk` : '';
  const activityText = result.activity?.title
    ? ` A gentle cognitive activity is ready: ${result.activity.title}${result.activity.prompt ? ` - ${result.activity.prompt}` : ''}.`
    : '';
  const alertText = result.alertsCreated > 0
    ? ' I also created a caregiver alert because the check-in suggests extra support may be needed.'
    : '';

  return [
    `I saved this as an emotional support check-in for ${subject}.`,
    `I detected ${detected}${riskText}.`,
    result.chatbotReply,
    `${activityText}${alertText}`.trim(),
  ].filter(Boolean).join(' ');
};

const formatAgenticActionFailure = (error, role) => {
  if (error.statusCode === 404 && Array.isArray(error.availableMedicationNames) && error.availableMedicationNames.length > 0) {
    const subject = String(role || '').toLowerCase() === 'caregiver' ? "this elder's" : 'your';
    const requested = normalizeMessageText(error.requestedMedicineName);
    const requestedText = requested ? ` "${requested}"` : '';
    const available = error.availableMedicationNames.slice(0, 6).join(', ');
    return `I could not find${requestedText} in ${subject} saved medicine list. I can update: ${available}. Try again with one of those saved names, or add the medicine first with strength, quantity, and daily amount.`;
  }

  if (error.statusCode === 404) {
    return 'I could not find the item to change. Please try again with the exact medicine or alert details.';
  }

  return `I could not complete that change: ${error.message || 'please try again.'}`;
};

const handleChat = async ({ userId, role, message, conversationId }) => {
  const startedAt = Date.now();
  const trimmedMessage = String(message || '').trim();

  if (!trimmedMessage) {
    const err = new Error('Message text is required');
    err.statusCode = 400;
    throw err;
  }

  const pendingAgenticAction = await getLatestPendingAgenticAction(conversationId, userId);
  if (pendingAgenticAction && (isConfirmMessage(trimmedMessage) || isCancelMessage(trimmedMessage))) {
    const conversation = await ensureConversation(userId, conversationId, trimmedMessage);
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'user',
      content: trimmedMessage,
    });

    if (isCancelMessage(trimmedMessage)) {
      const reply = 'Okay, I cancelled that change. Nothing was updated.';
      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: reply,
        intent: 'agentic_action_cancelled',
        latencyMs: Date.now() - startedAt,
      });
      return {
        conversationId: conversation,
        answer: reply,
        sql: '',
        rows: [],
        fallback: false,
        intent: 'agentic_action_cancelled',
      };
    }

    try {
      const actionResult = await executeAgenticAction({
        userId,
        action: pendingAgenticAction,
      });
      const rows = [
        {
          type: 'agentic_action_result',
          action: actionResult.action,
          data: actionResult.data,
          navigation: actionResult.navigation,
        },
      ];
      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: actionResult.answer,
        rowsReturned: rows,
        intent: 'agentic_action_completed',
        latencyMs: Date.now() - startedAt,
      });
      return {
        conversationId: conversation,
        answer: actionResult.answer,
        sql: '',
        rows,
        fallback: false,
        intent: 'agentic_action_completed',
        actionResult,
      };
    } catch (error) {
      const reply = formatAgenticActionFailure(error, role);
      const rows = [
        {
          type: 'agentic_action_error',
          requestedMedicineName: error.requestedMedicineName || '',
          availableMedicationNames: error.availableMedicationNames || [],
        },
      ];
      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: reply,
        rowsReturned: rows,
        intent: 'agentic_action_failed',
        fallbackReason: `agentic_action_failed: ${error.message}`,
        latencyMs: Date.now() - startedAt,
      });
      return {
        conversationId: conversation,
        answer: reply,
        sql: '',
        rows,
        fallback: true,
        fallbackReason: 'agentic_action_failed',
        intent: 'agentic_action_failed',
      };
    }
  }

  const parsedAgenticAction = parseAgenticAction(trimmedMessage);
  if (parsedAgenticAction) {
    const conversation = await ensureConversation(userId, conversationId, trimmedMessage);
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'user',
      content: trimmedMessage,
    });

    if (parsedAgenticAction.needsMoreInfo) {
      const reply = parsedAgenticAction.reply || 'I can help with that change, but I need a little more detail first.';
      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: reply,
        intent: 'agentic_action_needs_more_info',
        fallbackReason: 'agentic_action_needs_more_info',
        latencyMs: Date.now() - startedAt,
      });
      return {
        conversationId: conversation,
        answer: reply,
        sql: '',
        rows: [],
        fallback: true,
        fallbackReason: 'agentic_action_needs_more_info',
        intent: 'agentic_action_needs_more_info',
      };
    }

    const action = parsedAgenticAction.action;
    const answer = buildConfirmationAnswer(action);
    const rows = [{ type: 'pending_agentic_action', action }];
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: answer,
      rowsReturned: rows,
      intent: 'agentic_action_confirmation',
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer,
      sql: '',
      rows,
      fallback: false,
      intent: 'agentic_action_confirmation',
      pendingAction: action,
      followUps: ['Yes, confirm it.', 'Cancel this change.'],
    };
  }

  if (isEmotionalSupportAgentRequest(trimmedMessage)) {
    const conversation = await ensureConversation(userId, conversationId, trimmedMessage);
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'user',
      content: trimmedMessage,
    });

    try {
      const result = await runEmotionalSupportCheckIn({ userId, message: trimmedMessage });
      const answer = buildEmotionalSupportAnswer(result, role);
      const rows = [
        {
          type: 'emotional_support_checkin',
          sessionId: result.sessionId,
          detectedEmotion: result.detectedEmotion,
          confidence: result.confidence,
          scores: result.scores,
          riskLevel: result.riskLevel,
          intervention: result.intervention,
          activity: result.activity,
          alertsCreated: result.alertsCreated,
        },
      ];

      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: answer,
        rowsReturned: rows,
        intent: 'emotional_support_agent',
        latencyMs: Date.now() - startedAt,
      });

      return {
        conversationId: conversation,
        answer,
        sql: '',
        rows,
        fallback: false,
        intent: 'emotional_support_agent',
        followUps: [
          result.intervention?.followUpPrompt,
          result.activity?.title ? 'What cognitive activity should I do next?' : '',
          'Show my mood trend this week.',
        ].filter(Boolean).slice(0, 3),
      };
    } catch (error) {
      const reply = 'I could not save the emotional support check-in right now. I am still here with you, and you can try again in a moment.';
      await appendMessage({
        conversationId: conversation,
        userId,
        role: 'assistant',
        content: reply,
        intent: 'emotional_support_agent',
        fallbackReason: `emotional_support_failed: ${error.message}`,
        latencyMs: Date.now() - startedAt,
      });

      return {
        conversationId: conversation,
        answer: reply,
        sql: '',
        rows: [],
        fallback: true,
        fallbackReason: 'emotional_support_failed',
        intent: 'emotional_support_agent',
      };
    }
  }

  if (isHealthAdviceQuestion(trimmedMessage)) {
    const conversationRiskType = await getConversationHint(userId, conversationId);
    const result = await buildHealthAdviceResponse({
      userId,
      userRole: role || 'user',
      question: trimmedMessage,
      riskType: conversationRiskType,
      conversationId,
    });

    return {
      conversationId: result.conversationId,
      answer: result.answer,
      sql: '',
      rows: result.sources || [],
      sources: result.sources || [],
      safetyNote: result.safetyNote,
      fallback: Boolean(result.fallback),
      intent: 'health_risk_advice',
      followUps: result.followUps || [
        'How can I reduce this risk?',
        'Why is this risk high?',
        'What should my caregiver monitor?',
      ],
    };
  }

  if (isStrokeAssistantRequest(trimmedMessage)) {
    const extractedStrokeValues = extractStrokeValuesFromMessage(trimmedMessage);
    const result = await buildStrokeResponseWithSummary({
      userId,
      userRole: role || 'user',
      values: extractedStrokeValues,
      userMessage: trimmedMessage,
      conversationId,
    });

    return {
      conversationId: result.conversationId,
      answer: result.summary,
      sql: '',
      rows: [
        {
          riskType: result.riskType,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          selectedAlgorithm: result.selectedAlgorithm,
          factors: result.factors || [],
          updatedValues: extractedStrokeValues,
        },
      ],
      fallback: false,
      intent: 'stroke_prediction',
      followUps: [
        'Check my stroke risk.',
        'My BP is 145 over 90',
        'My weight is 60kg',
      ],
    };
  }

  const extractedHypertensionValues = extractHypertensionValuesFromMessage(trimmedMessage);
  if (isHypertensionAssistantRequest(trimmedMessage, extractedHypertensionValues)) {
    const result = await buildHypertensionResponseWithSummary({
      userId,
      userRole: role || 'user',
      values: extractedHypertensionValues,
      userMessage: trimmedMessage,
      conversationId,
    });

    return {
      conversationId: result.conversationId,
      answer: result.summary,
      sql: '',
      rows: [
        {
          riskType: result.riskType,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          selectedAlgorithm: result.selectedAlgorithm,
          factors: result.factors || [],
          updatedValues: extractedHypertensionValues,
        },
      ],
      fallback: false,
      intent: 'hypertension_prediction',
      followUps: [
        'Check my hypertension risk.',
        'My BP is 145 over 90',
        'My cholesterol is 240',
      ],
    };
  }

  const extractedDiabetesValues = extractHealthValuesFromMessage(trimmedMessage);
  if (isDiabetesAssistantRequest(trimmedMessage, extractedDiabetesValues)) {
    const result = await buildDiabetesResponseWithSummary({
      userId,
      userRole: role || 'user',
      values: extractedDiabetesValues,
      userMessage: trimmedMessage,
      conversationId,
    });

    return {
      conversationId: result.conversationId,
      answer: result.summary,
      sql: '',
      rows: [
        {
          riskType: result.riskType,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          selectedAlgorithm: result.selectedAlgorithm,
          factors: result.factors || [],
          updatedValues: extractedDiabetesValues,
        },
      ],
      fallback: false,
      intent: 'diabetes_prediction',
      followUps: [
        'Now my weight is 60kg',
        'My sugar is 150 today',
        'My BP is 145 over 90',
      ],
    };
  }

  const conversation = await ensureConversation(userId, conversationId, trimmedMessage);
  const recentMessages = await recentMessagesForContext(conversation);

  await appendMessage({
    conversationId: conversation,
    userId,
    role: 'user',
    content: trimmedMessage,
  });

  const messageRole = String(role || 'user').toLowerCase();
  const normalizedMessage = String(trimmedMessage || '').trim();
  const cachedResponse = getCachedAssistantResponse(userId, messageRole, normalizedMessage);
  if (cachedResponse) {
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: cachedResponse.answer,
      sqlUsed: cachedResponse.sql || '',
      rowsReturned: Array.isArray(cachedResponse.rows) ? cachedResponse.rows : [],
      intent: cachedResponse.intent || '',
      fallbackReason: cachedResponse.fallback ? 'cached_response' : '',
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: cachedResponse.answer,
      sql: cachedResponse.sql || '',
      rows: Array.isArray(cachedResponse.rows) ? cachedResponse.rows : [],
      fallback: Boolean(cachedResponse.fallback),
      intent: cachedResponse.intent || '',
      followUps: Array.isArray(cachedResponse.followUps) ? cachedResponse.followUps : [],
    };
  }

  const schemaDigest = buildPromptDigest();

  console.log('[Assistant] question received:', JSON.stringify(trimmedMessage));

  let nl2sqlResult;
  try {
    nl2sqlResult = await callMlNl2sql({
      question: trimmedMessage,
      user_role: role || 'user',
      recent_messages: recentMessages,
      schema_digest: schemaDigest,
    });
    console.log(
      '[Assistant] nl2sql ->',
      JSON.stringify({
        intent: nl2sqlResult?.intent,
        fallback: nl2sqlResult?.fallback,
        fallback_message: nl2sqlResult?.fallback_message,
        sql: nl2sqlResult?.sql ? `${String(nl2sqlResult.sql).slice(0, 160)}...` : '',
      })
    );
  } catch (error) {
    const reason = error.response?.data?.detail || error.message;
    console.error('[Assistant] nl2sql call failed:', reason);
    const reply = "I can't reach the AI assistant right now. Please try again in a moment.";
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: reply,
      fallbackReason: `nl2sql_unreachable: ${reason}`,
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: reply,
      sql: '',
      rows: [],
      fallback: true,
      fallbackReason: 'nl2sql_unreachable',
    };
  }

  const { sql: rawSql, intent, fallback } = nl2sqlResult;

  if (fallback || !rawSql) {
    const reply = nl2sqlResult.fallback_message
      || "I can answer questions about your medicines, doses, allergies, mood check-ins, cognitive activities and caregiver alerts. Could you rephrase your question?";
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: reply,
      intent: intent || '',
      fallbackReason: fallback ? 'llm_fallback' : 'no_sql_returned',
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: reply,
      sql: '',
      rows: [],
      fallback: true,
      fallbackReason: fallback ? 'llm_fallback' : 'no_sql_returned',
    };
  }

  let prepared;
  try {
    prepared = validateAndPrepareSql(rawSql);
    console.log('[Assistant] SQL validated OK ->', prepared.sql.slice(0, 200));
  } catch (validationError) {
    console.warn(
      '[Assistant] SQL validation FAILED:',
      validationError.code || 'unknown',
      validationError.message,
      '\nrawSql:',
      rawSql
    );
    const reply = "I cannot answer that safely. The query the assistant generated touched something outside your healthcare records, so I stopped it. You can try rephrasing or ask about a specific medicine, dose or mood check-in.";
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: reply,
      sqlUsed: rawSql,
      intent: intent || '',
      fallbackReason: `sql_validation_failed:${validationError.code || 'unknown'}`,
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: reply,
      sql: '',
      rows: [],
      fallback: true,
      fallbackReason: 'sql_validation_failed',
      validationError: validationError.code,
    };
  }

  let rows = [];
  try {
    rows = await runUserScopedQuery(prepared.sql, userId);
    console.log(`[Assistant] SQL executed -> ${rows.length} row(s)`);
  } catch (sqlError) {
    console.error('[Assistant] SQL execution failed:', sqlError.code, sqlError.message);
    const reply = "I tried to fetch the records but the database query did not run. Please try a slightly simpler question.";
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: reply,
      sqlUsed: prepared.sql,
      intent: intent || '',
      fallbackReason: `sql_execution_failed:${sqlError.code || 'unknown'}`,
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: reply,
      sql: prepared.sql,
      rows: [],
      fallback: true,
      fallbackReason: 'sql_execution_failed',
    };
  }

  const safeRows = redactRowsForLLM(rows);

  let answerResult;
  try {
    answerResult = await callMlAnswer({
      question: trimmedMessage,
      sql: prepared.sql,
      rows: safeRows,
      intent: intent || '',
      user_role: role || 'user',
    });
  } catch (error) {
    const reason = error.response?.data?.detail || error.message;
    const reply = rows.length === 0
      ? 'I could not find any matching records for that question.'
      : `I retrieved ${rows.length} record${rows.length === 1 ? '' : 's'} but the AI assistant is not available to summarise them right now. Please try again shortly.`;
    await appendMessage({
      conversationId: conversation,
      userId,
      role: 'assistant',
      content: reply,
      sqlUsed: prepared.sql,
      rowsReturned: rows,
      intent: intent || '',
      fallbackReason: `answer_unreachable: ${reason}`,
      latencyMs: Date.now() - startedAt,
    });
    return {
      conversationId: conversation,
      answer: reply,
      sql: prepared.sql,
      rows,
      fallback: true,
      fallbackReason: 'answer_unreachable',
    };
  }

  const finalAnswer = String(answerResult.answer || '').trim()
    || (rows.length === 0
      ? 'I could not find any matching records for that question.'
      : 'I retrieved your records but could not summarise them.');

  const finalFollowUps = Array.isArray(answerResult.follow_ups) ? answerResult.follow_ups : [];

  await appendMessage({
    conversationId: conversation,
    userId,
    role: 'assistant',
    content: finalAnswer,
    sqlUsed: prepared.sql,
    rowsReturned: rows,
    intent: intent || '',
    fallbackReason: '',
    latencyMs: Date.now() - startedAt,
  });

  setCachedAssistantResponse(userId, messageRole, normalizedMessage, {
    answer: finalAnswer,
    sql: prepared.sql,
    rows,
    fallback: false,
    intent: intent || '',
    followUps: finalFollowUps,
  });

  return {
    conversationId: conversation,
    answer: finalAnswer,
    sql: prepared.sql,
    rows,
    fallback: false,
    intent: intent || '',
    followUps: finalFollowUps,
  };
};

const listConversations = async (userId) => {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        (
          SELECT content FROM assistant_messages
          WHERE conversation_id = c.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_message,
        (
          SELECT content FROM assistant_messages
          WHERE conversation_id = c.id AND role = 'user'
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        ) AS first_user_message
      FROM assistant_conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC
      LIMIT 50
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    ...row,
    title: row.title === 'New conversation' && row.first_user_message
      ? buildConversationTitle(row.first_user_message)
      : row.title,
  }));
};

const listMessages = async (userId, conversationId) => {
  const owns = await pool.query(
    `SELECT id FROM assistant_conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [conversationId, userId]
  );

  if (owns.rows.length === 0) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }

  const result = await pool.query(
    `
      SELECT id, role, content, sql_used, rows_returned, intent, fallback_reason, created_at
      FROM assistant_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [conversationId]
  );

  return result.rows;
};

const MAX_TITLE_LEN = 80;

const renameConversation = async (userId, conversationId, rawTitle) => {
  const trimmed = String(rawTitle || '').trim().slice(0, MAX_TITLE_LEN);
  if (!trimmed) {
    const err = new Error('Title is required');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(
    `
      UPDATE assistant_conversations
      SET title = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, title, created_at, updated_at
    `,
    [trimmed, conversationId, userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

const deleteConversation = async (userId, conversationId) => {
  const result = await pool.query(
    `
      DELETE FROM assistant_conversations
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `,
    [conversationId, userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Conversation not found');
    err.statusCode = 404;
    throw err;
  }

  return { deletedId: result.rows[0].id };
};

module.exports = {
  handleChat,
  buildConversationTitle,
  listConversations,
  listMessages,
  renameConversation,
  deleteConversation,
};
