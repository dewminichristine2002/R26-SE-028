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

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const ML_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 60000);
const STATEMENT_TIMEOUT_MS = Number(process.env.ASSISTANT_SQL_TIMEOUT_MS || 5000);
const MAX_ROWS_RETURNED = Number(process.env.ASSISTANT_MAX_ROWS || 100);
const MAX_HISTORY_MESSAGES = 6;

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

const ensureConversation = async (userId, conversationId) => {
  if (conversationId) {
    const existing = await pool.query(
      `SELECT id FROM assistant_conversations WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, userId]
    );
    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }
  }

  const created = await pool.query(
    `
      INSERT INTO assistant_conversations (user_id, title)
      VALUES ($1, $2)
      RETURNING id
    `,
    [userId, 'New conversation']
  );
  return created.rows[0].id;
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

const handleChat = async ({ userId, role, message, conversationId }) => {
  const startedAt = Date.now();
  const trimmedMessage = String(message || '').trim();

  if (!trimmedMessage) {
    const err = new Error('Message text is required');
    err.statusCode = 400;
    throw err;
  }

  const conversation = await ensureConversation(userId, conversationId);
  const recentMessages = await recentMessagesForContext(conversation);

  await appendMessage({
    conversationId: conversation,
    userId,
    role: 'user',
    content: trimmedMessage,
  });

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
      || "I can answer questions about your medicines, doses, mood check-ins and caregiver alerts. Could you rephrase your question?";
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

  return {
    conversationId: conversation,
    answer: finalAnswer,
    sql: prepared.sql,
    rows,
    fallback: false,
    intent: intent || '',
    followUps: Array.isArray(answerResult.follow_ups) ? answerResult.follow_ups : [],
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
        ) AS last_message
      FROM assistant_conversations c
      WHERE c.user_id = $1
      ORDER BY c.updated_at DESC
      LIMIT 50
    `,
    [userId]
  );
  return result.rows;
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
  listConversations,
  listMessages,
  renameConversation,
  deleteConversation,
};
