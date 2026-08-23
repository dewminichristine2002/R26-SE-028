const { query } = require('../db/postgres');

function mapQuestion(row) {
  if (!row) {
    return null;
  }

  return {
    questionId: row.questionId,
    questionCode: row.questionCode,
    phase: row.phase,
    category: row.category,
    subCategory: row.subCategory,
    targetState: row.targetState,
    questionType: row.questionType,
    triggerKeywords: row.triggerKeywords,
    questionText: row.questionText,
    responseType: row.responseType,
    priority: row.priority,
    constructSource: row.constructSource,
    isActive: row.isActive,
    positiveNextCode: row.positiveNextCode,
    negativeNextCode: row.negativeNextCode,
    neutralNextCode: row.neutralNextCode,
    followupNextCode: row.followupNextCode,
    assessmentDimension: row.assessmentDimension,
    isAssessment: Boolean(row.isAssessment),
    minConfidence: row.minConfidence == null ? null : Number(row.minConfidence),
    difficulty: row.difficulty,
  };
}

const assessmentColumns = `
  question_id AS "questionId",
  question_code AS "questionCode",
  phase,
  category,
  sub_category AS "subCategory",
  target_state AS "targetState",
  question_type AS "questionType",
  trigger_keywords AS "triggerKeywords",
  question_text AS "questionText",
  response_type AS "responseType",
  priority,
  construct_source AS "constructSource",
  is_active AS "isActive",
  positive_next_code AS "positiveNextCode",
  negative_next_code AS "negativeNextCode",
  neutral_next_code AS "neutralNextCode",
  followup_next_code AS "followupNextCode",
  assessment_dimension AS "assessmentDimension",
  is_assessment AS "isAssessment",
  min_confidence AS "minConfidence",
  difficulty
`;

async function getAssessmentQuestionByCode(questionCode) {
  const result = await query(
    `SELECT ${assessmentColumns}
     FROM adaptive_question_bank
     WHERE question_code = $1 AND is_active = TRUE AND is_assessment = TRUE
     LIMIT 1`,
    [questionCode]
  );

  return mapQuestion(result.rows[0]);
}

async function getAssessmentCandidates({
  targetState = null,
  excludedQuestionIds = [],
  excludedQuestionCodes = [],
} = {}) {
  const params = [];
  const conditions = ['is_active = TRUE', 'is_assessment = TRUE'];

  if (targetState) {
    params.push(targetState);
    conditions.push(`target_state = $${params.length}`);
  }
  if (excludedQuestionIds.length) {
    params.push(excludedQuestionIds);
    conditions.push(`question_id <> ALL($${params.length}::int[])`);
  }
  if (excludedQuestionCodes.length) {
    params.push(excludedQuestionCodes);
    conditions.push(`question_code <> ALL($${params.length}::text[])`);
  }

  const result = await query(
    `SELECT ${assessmentColumns}
     FROM adaptive_question_bank
     WHERE ${conditions.join(' AND ')}
     ORDER BY priority ASC, question_id ASC`,
    params
  );

  return result.rows.map(mapQuestion);
}

async function getNeutralAssessmentCandidates(options = {}) {
  return getAssessmentCandidates({ ...options, targetState: 'neutral' });
}

async function getBranchQuestion(questionCode) {
  if (!questionCode) {
    return null;
  }

  return getAssessmentQuestionByCode(questionCode);
}

async function getOpeningQuestion() {
  const result = await query(
    `
      SELECT
        question_id AS "questionId",
        question_code AS "questionCode",
        phase,
        category,
        sub_category AS "subCategory",
        target_state AS "targetState",
        question_type AS "questionType",
        trigger_keywords AS "triggerKeywords",
        question_text AS "questionText",
        response_type AS "responseType",
        priority,
        construct_source AS "constructSource",
        is_active AS "isActive"
      FROM adaptive_question_bank
      WHERE is_active = TRUE
        AND phase = 'opening'
      ORDER BY priority ASC, question_id ASC
      LIMIT 1
    `
  );

  return mapQuestion(result.rows[0]);
}

async function getQuestionByCode(questionCode) {
  const result = await query(
    `
      SELECT
        question_id AS "questionId",
        question_code AS "questionCode",
        phase,
        category,
        sub_category AS "subCategory",
        target_state AS "targetState",
        question_type AS "questionType",
        trigger_keywords AS "triggerKeywords",
        question_text AS "questionText",
        response_type AS "responseType",
        priority,
        construct_source AS "constructSource",
        is_active AS "isActive"
      FROM adaptive_question_bank
      WHERE question_code = $1
      LIMIT 1
    `,
    [questionCode]
  );

  return mapQuestion(result.rows[0]);
}

async function getQuestionByTargetState(targetState, excludedQuestionCode = null) {
  const params = [targetState];
  let exclusionClause = '';

  if (excludedQuestionCode) {
    params.push(excludedQuestionCode);
    exclusionClause = 'AND question_code <> $2';
  }

  const result = await query(
    `
      SELECT
        question_id AS "questionId",
        question_code AS "questionCode",
        phase,
        category,
        sub_category AS "subCategory",
        target_state AS "targetState",
        question_type AS "questionType",
        trigger_keywords AS "triggerKeywords",
        question_text AS "questionText",
        response_type AS "responseType",
        priority,
        construct_source AS "constructSource",
        is_active AS "isActive"
      FROM adaptive_question_bank
      WHERE is_active = TRUE
        AND phase = 'adaptive'
        AND target_state = $1
        ${exclusionClause}
      ORDER BY priority ASC, question_id ASC
      LIMIT 1
    `,
    params
  );

  return mapQuestion(result.rows[0]);
}

async function getAnyActiveQuestion(targetState = null) {
  const params = [];
  let targetStateClause = '';

  if (targetState) {
    params.push(targetState);
    targetStateClause = 'AND target_state = $1';
  }

  const result = await query(
    `
      SELECT
        question_id AS "questionId",
        question_code AS "questionCode",
        phase,
        category,
        sub_category AS "subCategory",
        target_state AS "targetState",
        question_type AS "questionType",
        trigger_keywords AS "triggerKeywords",
        question_text AS "questionText",
        response_type AS "responseType",
        priority,
        construct_source AS "constructSource",
        is_active AS "isActive"
      FROM adaptive_question_bank
      WHERE is_active = TRUE
        ${targetStateClause}
      ORDER BY priority ASC, question_id ASC
      LIMIT 1
    `,
    params
  );

  return mapQuestion(result.rows[0]);
}

async function getQuestionByCriteria({
  targetState = null,
  questionTypes = [],
  excludedQuestionIds = [],
  includeOpening = false,
}) {
  const params = [];
  const conditions = ['is_active = TRUE'];
  const typeList = questionTypes.length ? questionTypes : ['follow_up'];

  if (!includeOpening) {
    conditions.push("phase <> 'opening'");
  }

  if (targetState) {
    params.push(targetState);
    conditions.push(`target_state = $${params.length}`);
  }

  if (typeList.length) {
    params.push(typeList);
    conditions.push(`question_type = ANY($${params.length}::text[])`);
  }

  if (excludedQuestionIds.length) {
    params.push(excludedQuestionIds);
    conditions.push(`question_id <> ALL($${params.length}::int[])`);
  }

  const typeOrderParamPosition = params.length + 1;
  params.push(typeList);

  const result = await query(
    `
      SELECT
        question_id AS "questionId",
        question_code AS "questionCode",
        phase,
        category,
        sub_category AS "subCategory",
        target_state AS "targetState",
        question_type AS "questionType",
        trigger_keywords AS "triggerKeywords",
        question_text AS "questionText",
        response_type AS "responseType",
        priority,
        construct_source AS "constructSource",
        is_active AS "isActive"
      FROM adaptive_question_bank
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        COALESCE(array_position($${typeOrderParamPosition}::text[], question_type), 999),
        priority ASC,
        question_id ASC
      LIMIT 1
    `,
    params
  );

  return mapQuestion(result.rows[0]);
}

async function getQuestionById(questionId) {
  const result = await query(
    `
      SELECT ${assessmentColumns}
      FROM adaptive_question_bank
      WHERE question_id = $1
      LIMIT 1
    `,
    [questionId]
  );

  return mapQuestion(result.rows[0]);
}

module.exports = {
  getAssessmentCandidates,
  getAssessmentQuestionByCode,
  getBranchQuestion,
  getNeutralAssessmentCandidates,
  getOpeningQuestion,
  getQuestionByCode,
  getQuestionByTargetState,
  getQuestionByCriteria,
  getQuestionById,
  getAnyActiveQuestion,
};
