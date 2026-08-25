const EMOTIONS = Object.freeze([
  'happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral',
]);
const RECENCY_WEIGHTS = Object.freeze([1, 1.05, 1.1, 1.15, 1.2]);
const RULE_FALLBACK_WEIGHT = 0.55;
const DEFAULT_CONTEXTUAL_EVIDENCE_WEIGHT = 0.65;
const EXPLICIT_EVIDENCE_WEIGHT = 1;
const EVIDENCE_STRENGTH_FACTORS = Object.freeze({
  explicit_self_report: 1.7,
  strong_ml: 1,
  contextual_supported: 0.85,
  weak_contextual: 0.55,
  fallback: 0.85,
  ambiguous: 0.6,
});
const AMBIGUITY_MARGIN = 0.05;
const CONCERN_EMOTIONS = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);

class AdaptiveAggregationError extends Error {}

function round(value, places = 4) {
  return Number(Number(value).toFixed(places));
}

function validateTurns(turns) {
  if (!Array.isArray(turns) || turns.length !== 5) {
    throw new AdaptiveAggregationError(`A completed adaptive result requires exactly five turns; received ${Array.isArray(turns) ? turns.length : 0}.`);
  }
  const ordered = [...turns].sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
  ordered.forEach((turn, index) => {
    if (Number(turn.questionNumber) !== index + 1) {
      throw new AdaptiveAggregationError('Adaptive turns must contain unique question numbers 1 through 5.');
    }
    if (!EMOTIONS.includes(turn.detectedState)) {
      throw new AdaptiveAggregationError(`Unsupported adaptive emotion: ${turn.detectedState}`);
    }
    if (!['ml_model', 'rule_fallback'].includes(turn.detectionSource)) {
      throw new AdaptiveAggregationError(`Unsupported evidence source: ${turn.detectionSource}`);
    }
    if (turn.detectionSource === 'ml_model') {
      const confidence = Number(turn.confidenceScore);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new AdaptiveAggregationError('ML turns require confidence_score between zero and one.');
      }
    } else if (turn.confidenceScore != null) {
      throw new AdaptiveAggregationError('Rule fallback turns must not contain model confidence.');
    }
  });
  return ordered;
}

function deriveConversationEngagement(turns) {
  const meaningfulAnswers = turns.filter((turn) => String(turn.userAnswer || '').trim().split(/\s+/).filter(Boolean).length >= 3).length;
  if (meaningfulAnswers >= 4) return 'engaged';
  if (meaningfulAnswers >= 2) return 'partially_engaged';
  return 'limited_engagement';
}

function aggregateAdaptiveSessionResult(turns) {
  const ordered = validateTurns(turns);
  const emotionScores = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0]));
  const explicitEvidenceByEmotion = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0]));
  const turnEvidence = ordered.map((turn, index) => {
    const recencyWeight = RECENCY_WEIGHTS[index];
    const modelConfidence = turn.detectionSource === 'ml_model' ? Number(turn.confidenceScore) : null;
    const ruleEvidenceWeight = turn.detectionSource === 'rule_fallback' ? RULE_FALLBACK_WEIGHT : null;
    const contextualInterpretation = turn.analysisMetadata?.contextualInterpretation;
    const contextualEvidenceWeight = contextualInterpretation?.evidenceSource === 'question_context'
      ? Number(contextualInterpretation.contextualEvidenceWeight || DEFAULT_CONTEXTUAL_EVIDENCE_WEIGHT)
      : null;
    const explicitEvidenceWeight = contextualInterpretation?.evidenceSource === 'explicit_self_report'
      ? Number(contextualInterpretation.explicitEvidenceWeight || EXPLICIT_EVIDENCE_WEIGHT)
      : null;
    const evidenceStrength = contextualInterpretation?.evidenceStrength || (
      contextualEvidenceWeight != null ? 'contextual_supported' : modelConfidence != null ? 'strong_ml' : 'fallback'
    );
    const evidenceStrengthFactor = EVIDENCE_STRENGTH_FACTORS[evidenceStrength] || 1;
    const sourceWeight = explicitEvidenceWeight ?? contextualEvidenceWeight ?? modelConfidence ?? ruleEvidenceWeight;
    const weightedEvidence = sourceWeight * recencyWeight * evidenceStrengthFactor;
    emotionScores[turn.detectedState] += weightedEvidence;
    if (explicitEvidenceWeight != null) explicitEvidenceByEmotion[turn.detectedState] += weightedEvidence;
    return {
      questionNumber: turn.questionNumber,
      emotion: turn.detectedState,
      source: turn.detectionSource,
      modelConfidence,
      ruleEvidenceWeight,
      ruleScore: turn.detectionSource === 'rule_fallback' ? turn.analysisMetadata?.ruleScore ?? null : null,
      contextualEvidenceWeight,
      explicitEvidenceWeight,
      evidenceStrength,
      evidenceStrengthFactor,
      evidenceSource: contextualInterpretation?.evidenceSource || turn.detectionSource,
      rawMlEmotion: contextualInterpretation?.rawMlEmotion || null,
      rawMlConfidence: contextualInterpretation?.rawMlConfidence ?? null,
      recencyWeight,
      weightedEvidence: round(weightedEvidence),
    };
  });

  const totalEvidence = Object.values(emotionScores).reduce((total, score) => total + score, 0);
  const ranked = EMOTIONS.map((emotion) => ({ emotion, score: emotionScores[emotion] }))
    .sort((a, b) => b.score - a.score || EMOTIONS.indexOf(a.emotion) - EMOTIONS.indexOf(b.emotion));
  const normalizedScores = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, round(emotionScores[emotion] / totalEvidence)]));
  const topDifference = (ranked[0].score - ranked[1].score) / totalEvidence;
  const explicitLeader = explicitEvidenceByEmotion[ranked[0].emotion] > 0;
  const ambiguous = topDifference < AMBIGUITY_MARGIN && !explicitLeader;
  const finalEmotionalState = ambiguous ? 'neutral' : ranked[0].emotion;
  const finalConfidence = emotionScores[finalEmotionalState] / totalEvidence;

  return {
    finalEmotionalState,
    finalConfidence: round(finalConfidence),
    baseRiskLevel: CONCERN_EMOTIONS.has(finalEmotionalState) ? 'medium' : 'low',
    conversationEngagement: deriveConversationEngagement(ordered),
    explanation: {
      winningEmotion: finalEmotionalState,
      rawWinningEmotion: ranked[0].emotion,
      finalEvidenceScore: round(finalConfidence),
      runnerUpEmotion: ranked[1].emotion,
      runnerUpScore: round(ranked[1].score / totalEvidence),
      explicitLeader,
      ambiguous,
      ambiguityMargin: AMBIGUITY_MARGIN,
      topScoreDifference: round(topDifference),
      totalEvidence: round(totalEvidence),
      emotionScores: Object.fromEntries(EMOTIONS.map((emotion) => [emotion, round(emotionScores[emotion])])),
      normalizedEmotionScores: normalizedScores,
      turnEvidence,
      confidenceSemantics: 'Normalized accumulated evidence strength, not a model or clinical probability.',
    },
  };
}

module.exports = {
  AMBIGUITY_MARGIN,
  AdaptiveAggregationError,
  EMOTIONS,
  RECENCY_WEIGHTS,
  RULE_FALLBACK_WEIGHT,
  EVIDENCE_STRENGTH_FACTORS,
  aggregateAdaptiveSessionResult,
  deriveConversationEngagement,
};
