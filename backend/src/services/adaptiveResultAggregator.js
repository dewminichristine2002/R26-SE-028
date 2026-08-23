const EMOTIONS = Object.freeze([
  'happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral',
]);
const RECENCY_WEIGHTS = Object.freeze([1, 1.05, 1.1, 1.15, 1.2]);
const RULE_FALLBACK_WEIGHT = 0.55;
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
  const turnEvidence = ordered.map((turn, index) => {
    const recencyWeight = RECENCY_WEIGHTS[index];
    const modelConfidence = turn.detectionSource === 'ml_model' ? Number(turn.confidenceScore) : null;
    const ruleEvidenceWeight = turn.detectionSource === 'rule_fallback' ? RULE_FALLBACK_WEIGHT : null;
    const sourceWeight = modelConfidence ?? ruleEvidenceWeight;
    const weightedEvidence = sourceWeight * recencyWeight;
    emotionScores[turn.detectedState] += weightedEvidence;
    return {
      questionNumber: turn.questionNumber,
      emotion: turn.detectedState,
      source: turn.detectionSource,
      modelConfidence,
      ruleEvidenceWeight,
      ruleScore: turn.detectionSource === 'rule_fallback' ? turn.analysisMetadata?.ruleScore ?? null : null,
      recencyWeight,
      weightedEvidence: round(weightedEvidence),
    };
  });

  const totalEvidence = Object.values(emotionScores).reduce((total, score) => total + score, 0);
  const ranked = EMOTIONS.map((emotion) => ({ emotion, score: emotionScores[emotion] }))
    .sort((a, b) => b.score - a.score || EMOTIONS.indexOf(a.emotion) - EMOTIONS.indexOf(b.emotion));
  const normalizedScores = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, round(emotionScores[emotion] / totalEvidence)]));
  const topDifference = (ranked[0].score - ranked[1].score) / totalEvidence;
  const ambiguous = topDifference < AMBIGUITY_MARGIN;
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
  aggregateAdaptiveSessionResult,
  deriveConversationEngagement,
};
