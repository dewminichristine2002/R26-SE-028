const PROTECTED_EMOTIONS = new Set(['anxiety', 'anger', 'cognitive_fog']);

function recommendNextDifficulty(context) {
  const reasons = [];
  let nextDifficulty = context.currentDifficulty === 'medium' ? 'medium' : 'easy';
  if (context.riskLevel === 'high') reasons.push('high_risk_requires_easy');
  if (PROTECTED_EMOTIONS.has(context.finalEmotionalState)) reasons.push('emotion_requires_gentle_load');
  if (context.conversationEngagement === 'limited_engagement') reasons.push('limited_engagement_requires_easy');
  if (reasons.length) nextDifficulty = 'easy';
  else if (context.currentDifficulty === 'medium' && context.accuracy < 0.5) {
    nextDifficulty = 'easy'; reasons.push('medium_accuracy_below_0.50');
  } else if (context.currentDifficulty === 'easy' && context.accuracy >= 0.8 && context.completionStatus === 'completed') {
    const comparableSuccesses = (context.recentCognitiveAttempts || []).filter((attempt) => attempt.difficulty === 'easy' && attempt.completionStatus === 'completed' && Number(attempt.accuracy) >= 0.8 && (!context.currentActivityType || attempt.activityType === context.currentActivityType)).length;
    if (comparableSuccesses >= 2 && context.conversationEngagement === 'engaged') {
      nextDifficulty = 'medium'; reasons.push('accuracy_at_least_0.80', 'two_recent_successful_easy_attempts', 'low_or_medium_risk', 'emotion_allows_normal_load');
    } else reasons.push('insufficient_repeated_success_for_increase');
  } else reasons.push('keep_current_difficulty');
  return { nextDifficulty, explanation: { currentDifficulty: context.currentDifficulty, activityType: context.currentActivityType || null, accuracy: context.accuracy, completionStatus: context.completionStatus, recentComparableSuccesses: (context.recentCognitiveAttempts || []).filter((a) => a.difficulty === context.currentDifficulty && a.completionStatus === 'completed' && Number(a.accuracy) >= 0.8 && (!context.currentActivityType || a.activityType === context.currentActivityType)).length, finalEmotion: context.finalEmotionalState, risk: context.riskLevel, conversationEngagement: context.conversationEngagement, nextDifficulty, reasons, responseTimeUsedForDecision: false } };
}

module.exports = { recommendNextDifficulty };
