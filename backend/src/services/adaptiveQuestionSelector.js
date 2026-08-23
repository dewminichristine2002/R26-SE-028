const questionRepository = require('../repositories/adaptiveQuestionBankRepository');

const modelMetadata = require('../../ml/emotion_classifier/selected_model_metadata.json');

const SAFE_CONFIDENCE_THRESHOLD = Number(modelMetadata.confidence_threshold);
const HISTORY_LOOKBACK_LIMIT = 7;
const MIN_REPEATED_HISTORY_COUNT = 2;

const SCORE_WEIGHTS = Object.freeze({
  CURRENT_EMOTION_MATCH: 40,
  POLARITY_BRANCH_MATCH: 35,
  GENERAL_BRANCH_MATCH: 20,
  HISTORY_RELEVANCE: 10,
  MAX_PRIORITY_SCORE: 10,
  NEW_DIMENSION: 15,
  UNCERTAINTY_CLARIFICATION: 10,
  NEUTRAL_FALLBACK: 5,
  REPEATED_DIMENSION_PENALTY: -10,
  CONTEXTUAL_MISMATCH_PENALTY: -10,
});

const supportedStates = new Set([
  'happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral',
]);

function normalizeState(value) {
  const state = String(value || '').trim().toLowerCase();
  return supportedStates.has(state) ? state : 'neutral';
}

function normalizeHistory(history = []) {
  return history
    .slice(0, HISTORY_LOOKBACK_LIMIT)
    .map((entry) => normalizeState(
      typeof entry === 'string'
        ? entry
        : entry.detectedEmotionalState || entry.detected_emotional_state || entry.state
    ));
}

function getRepeatedHistoryState(history = []) {
  const normalized = normalizeHistory(history);
  const counts = new Map();
  normalized.forEach((state, index) => {
    if (state === 'neutral') return;
    const current = counts.get(state) || { count: 0, firstIndex: index };
    current.count += 1;
    current.firstIndex = Math.min(current.firstIndex, index);
    counts.set(state, current);
  });

  return [...counts.entries()]
    .filter(([, details]) => details.count >= MIN_REPEATED_HISTORY_COUNT)
    .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

function isStrongCurrentEvidence({ detectedEmotion, confidence }) {
  return normalizeState(detectedEmotion) !== 'neutral' && Number(confidence || 0) >= SAFE_CONFIDENCE_THRESHOLD;
}

function determineTargetState(context) {
  if (isStrongCurrentEvidence(context)) {
    return {
      targetState: normalizeState(context.detectedEmotion),
      source: 'current_answer',
    };
  }

  const branchCode = getPreferredBranchCode(context.previousQuestion, context.answerPolarity);
  if (branchCode) {
    return {
      targetState: 'neutral',
      source: 'branch_with_uncertain_answer',
      branchCode,
    };
  }

  const repeatedHistoryState = getRepeatedHistoryState(context.recentEmotionHistory);
  if (repeatedHistoryState && normalizeState(context.detectedEmotion) !== 'neutral') {
    return { targetState: repeatedHistoryState, source: 'repeated_history' };
  }

  return { targetState: 'neutral', source: 'neutral_fallback' };
}

function getPreferredBranchCode(previousQuestion, polarity) {
  if (!previousQuestion) return null;
  const branches = {
    positive: previousQuestion.positiveNextCode,
    negative: previousQuestion.negativeNextCode,
    neutral: previousQuestion.neutralNextCode,
    unclear: previousQuestion.neutralNextCode,
  };
  return branches[polarity] || previousQuestion.followupNextCode || null;
}

function priorityScore(priority) {
  const numeric = Number(priority || 1);
  return Math.max(0, SCORE_WEIGHTS.MAX_PRIORITY_SCORE - Math.max(0, numeric - 1));
}

function scoreCandidate(question, context) {
  if (!question?.isActive || !question?.isAssessment) {
    return { valid: false, score: Number.NEGATIVE_INFINITY, breakdown: { invalid: true } };
  }
  if ((context.askedQuestionIds || []).includes(question.questionId) ||
      (context.askedQuestionCodes || []).includes(question.questionCode)) {
    return { valid: false, score: Number.NEGATIVE_INFINITY, breakdown: { alreadyAsked: true } };
  }

  const currentEmotion = normalizeState(context.detectedEmotion);
  const strongCurrentEvidence = isStrongCurrentEvidence(context);
  const preferredBranchCode = getPreferredBranchCode(context.previousQuestion, context.answerPolarity);
  const generalBranchCode = context.previousQuestion?.followupNextCode;
  const historyStates = normalizeHistory(context.recentEmotionHistory);
  const askedDimensions = context.askedDimensions || [];
  const isRepeatedDimension = Boolean(question.assessmentDimension && askedDimensions.includes(question.assessmentDimension));
  const breakdown = {
    emotionMatch: 0,
    branchMatch: 0,
    generalBranchMatch: 0,
    historyRelevance: 0,
    priority: priorityScore(question.priority),
    dimensionDiversity: 0,
    uncertaintyClarification: 0,
    neutralFallback: 0,
    penalties: 0,
  };

  if (strongCurrentEvidence && question.targetState === currentEmotion) {
    breakdown.emotionMatch = SCORE_WEIGHTS.CURRENT_EMOTION_MATCH;
  }
  if (preferredBranchCode && question.questionCode === preferredBranchCode) {
    breakdown.branchMatch = SCORE_WEIGHTS.POLARITY_BRANCH_MATCH;
  } else if (generalBranchCode && question.questionCode === generalBranchCode) {
    breakdown.generalBranchMatch = SCORE_WEIGHTS.GENERAL_BRANCH_MATCH;
  }
  if (historyStates.includes(question.targetState) && question.targetState !== 'neutral') {
    breakdown.historyRelevance = SCORE_WEIGHTS.HISTORY_RELEVANCE;
  }
  if (question.assessmentDimension) {
    breakdown.dimensionDiversity = isRepeatedDimension
      ? SCORE_WEIGHTS.REPEATED_DIMENSION_PENALTY
      : SCORE_WEIGHTS.NEW_DIMENSION;
  }
  const uncertain = currentEmotion === 'neutral' || Number(context.confidence || 0) < SAFE_CONFIDENCE_THRESHOLD;
  if (uncertain && question.assessmentDimension === 'clarification') {
    breakdown.uncertaintyClarification = SCORE_WEIGHTS.UNCERTAINTY_CLARIFICATION;
  }
  if (question.targetState === 'neutral') {
    breakdown.neutralFallback = SCORE_WEIGHTS.NEUTRAL_FALLBACK;
  }
  if (strongCurrentEvidence && question.targetState !== currentEmotion && question.targetState !== 'neutral') {
    breakdown.penalties += SCORE_WEIGHTS.CONTEXTUAL_MISMATCH_PENALTY;
  }

  return {
    valid: true,
    score: Object.values(breakdown).reduce((total, value) => total + value, 0),
    breakdown,
  };
}

function chooseHighestScoring(candidates, context) {
  return candidates
    .map((question) => ({ question, ...scoreCandidate(question, context) }))
    .filter((entry) => entry.valid)
    .sort((a, b) => b.score - a.score || Number(a.question.priority || 1) - Number(b.question.priority || 1) || a.question.questionCode.localeCompare(b.question.questionCode))[0] || null;
}

function buildSelectionReason({ selected, context, target }) {
  return {
    targetState: target.targetState,
    targetSource: target.source,
    currentDetectedEmotion: normalizeState(context.detectedEmotion),
    confidence: Number.isFinite(Number(context.confidence)) ? Number(context.confidence) : null,
    answerPolarity: context.answerPolarity || null,
    historyStates: normalizeHistory(context.recentEmotionHistory),
    selectedQuestionCode: selected.question.questionCode,
    selectedDimension: selected.question.assessmentDimension,
    score: selected.score,
    scoreBreakdown: selected.breakdown,
  };
}

async function selectNextAdaptiveQuestion(context, repository = questionRepository) {
  if (Number(context.nextQuestionNumber || 0) > 5) {
    return null;
  }
  const target = determineTargetState(context);
  const queryOptions = {
    excludedQuestionIds: context.askedQuestionIds || [],
    excludedQuestionCodes: context.askedQuestionCodes || [],
  };
  const candidateGroups = await Promise.all([
    repository.getAssessmentCandidates({ ...queryOptions, targetState: target.targetState }),
    target.targetState === 'neutral' ? Promise.resolve([]) : repository.getNeutralAssessmentCandidates(queryOptions),
  ]);
  const preferredBranchCode = getPreferredBranchCode(context.previousQuestion, context.answerPolarity);
  if (preferredBranchCode) {
    const branchQuestion = await repository.getBranchQuestion(preferredBranchCode);
    if (branchQuestion) candidateGroups.push([branchQuestion]);
  }

  const candidates = [...new Map(candidateGroups.flat().map((question) => [question.questionCode, question])).values()];
  const selected = chooseHighestScoring(candidates, context);
  if (!selected) return null;

  return {
    question: selected.question,
    selectionReason: buildSelectionReason({ selected, context, target }),
  };
}

async function selectFirstAdaptiveQuestion({ userId, recentEmotionHistory = [] }, repository = questionRepository) {
  const historyTarget = getRepeatedHistoryState(recentEmotionHistory);
  const targetState = historyTarget || 'neutral';
  const candidates = await repository.getAssessmentCandidates({ targetState });
  const eligibleCandidates = historyTarget
    ? candidates
    : candidates.filter((question) => question.phase === 'opening' || question.assessmentDimension === 'general_wellbeing');
  const context = {
    userId,
    detectedEmotion: historyTarget || 'neutral',
    confidence: historyTarget ? SAFE_CONFIDENCE_THRESHOLD : 0,
    recentEmotionHistory,
    askedQuestionIds: [],
    askedQuestionCodes: [],
    askedDimensions: [],
  };
  const selected = chooseHighestScoring(eligibleCandidates.length ? eligibleCandidates : candidates, context);
  if (!selected) return null;

  return {
    question: selected.question,
    selectionReason: buildSelectionReason({
      selected,
      context,
      target: { targetState, source: historyTarget ? 'repeated_recent_history' : 'neutral_opening' },
    }),
  };
}

module.exports = {
  MIN_REPEATED_HISTORY_COUNT,
  SAFE_CONFIDENCE_THRESHOLD,
  SCORE_WEIGHTS,
  chooseHighestScoring,
  determineTargetState,
  getPreferredBranchCode,
  getRepeatedHistoryState,
  scoreCandidate,
  selectFirstAdaptiveQuestion,
  selectNextAdaptiveQuestion,
};
