const crypto = require('crypto');

function canonicalQuestions(rows) {
  return rows.map((row) => ({
    question_id: row.question_id,
    question_code: row.question_code,
    question_text: row.question_text,
    phase: row.phase,
    category: row.category,
    sub_category: row.sub_category ?? null,
    target_state: row.target_state,
    question_type: row.question_type,
    trigger_keywords: row.trigger_keywords || [],
    response_type: row.response_type,
    quick_replies: row.quick_replies || [],
    priority: row.priority,
    construct_source: row.construct_source ?? null,
    is_active: Boolean(row.is_active),
    assessment_dimension: row.assessment_dimension ?? null,
    is_assessment: Boolean(row.is_assessment),
    positive_next_code: row.positive_next_code ?? null,
    negative_next_code: row.negative_next_code ?? null,
    neutral_next_code: row.neutral_next_code ?? null,
    followup_next_code: row.followup_next_code ?? null,
  }));
}

function buildQuestionBankExport(rows, exportedAt = new Date().toISOString()) {
  const questions = canonicalQuestions(rows);
  const digest = crypto.createHash('sha256').update(JSON.stringify(questions)).digest('hex');
  return {
    export_schema: 'eldermeds-question-bank-export-1.0',
    exported_at: exportedAt,
    question_bank_version: `sha256:${digest}`,
    question_count: questions.length,
    questions,
  };
}

module.exports = { buildQuestionBankExport, canonicalQuestions };
