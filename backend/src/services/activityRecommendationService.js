const CATEGORY_BY_EMOTION = Object.freeze({
  happiness: 'cognitive_engagement',
  neutral: 'cognitive_engagement',
  sadness: 'reminiscence_engagement',
  loneliness: 'reminiscence_engagement',
  anxiety: 'calming_support',
  anger: 'calming_support',
  cognitive_fog: 'cognitive_engagement',
});

const WEIGHTS = Object.freeze({ emotionCategoryMatch: 40, riskFit: 20, engagementFit: 15, variety: 10, difficultyFit: 10, recentRepeat: -15, riskMismatch: -30 });

function desiredDifficulty({ finalEmotionalState, riskLevel, conversationEngagement, recommendedDifficulty }) {
  if (recommendedDifficulty === 'medium' && riskLevel !== 'high' && conversationEngagement === 'engaged' && !['anxiety', 'anger', 'cognitive_fog'].includes(finalEmotionalState)) return 'medium';
  return finalEmotionalState === 'happiness' && riskLevel === 'low' && conversationEngagement === 'engaged' ? 'medium' : 'easy';
}

function scoreCandidate(activity, context) {
  const selectedCategory = CATEGORY_BY_EMOTION[context.finalEmotionalState];
  if (!selectedCategory) throw new Error(`Unsupported final emotional state: ${context.finalEmotionalState}`);
  const desired = desiredDifficulty(context);
  const recent = context.recentActivityHistory || [];
  const isRiskMismatch = context.riskLevel === 'high' && activity.difficulty !== 'easy';
  const engagementFits = context.conversationEngagement === 'engaged'
    || (activity.difficulty === 'easy' && (context.conversationEngagement !== 'limited_engagement' || activity.estimatedDurationMinutes <= 2));
  const recentIndex = recent.indexOf(activity.activityCode);
  const recentTypeIndex = recent.findIndex((code) => String(code).replace(/_(easy|medium)$/, '') === String(activity.activityCode).replace(/_(easy|medium)$/, ''));
  const repetitionPenalty = recentIndex === 0 ? WEIGHTS.recentRepeat : recentIndex > 0 ? -Math.max(2, 8 - recentIndex * 2) : 0;
  const typeRepetitionPenalty = recentTypeIndex >= 0 ? -Math.max(1, 6 - recentTypeIndex) : 0;
  const reasons = {
    emotionCategoryMatch: activity.category === selectedCategory ? WEIGHTS.emotionCategoryMatch : 0,
    riskFit: isRiskMismatch ? 0 : WEIGHTS.riskFit,
    engagementFit: engagementFits ? WEIGHTS.engagementFit : 0,
    variety: recentTypeIndex < 0 ? WEIGHTS.variety : 0,
    difficultyFit: activity.difficulty === desired ? WEIGHTS.difficultyFit : 0,
    penalties: repetitionPenalty + typeRepetitionPenalty + (isRiskMismatch ? WEIGHTS.riskMismatch : 0),
  };
  return { activity, score: Object.values(reasons).reduce((sum, value) => sum + value, 0), reasons };
}

function recommendActivity(context) {
  if (!Array.isArray(context.activities) || !context.activities.length) throw new Error('No active routable activities are available.');
  const category = CATEGORY_BY_EMOTION[context.finalEmotionalState];
  const safetyRequiresEasy = context.riskLevel === 'high'
    || ['anxiety', 'anger', 'cognitive_fog'].includes(context.finalEmotionalState)
    || context.conversationEngagement === 'limited_engagement';
  const fogPreferred = new Set(['orientation_activity', 'word_category', 'simple_math', 'short_memory_recall']);
  let eligible = context.activities.filter((activity) => activity.category === category && (!safetyRequiresEasy || activity.difficulty === 'easy'));
  if (context.finalEmotionalState === 'cognitive_fog') {
    eligible = eligible.filter((activity) => fogPreferred.has(String(activity.activityCode).replace(/_(easy|medium)$/, '')));
  }
  if (!eligible.length) throw new Error(`No activity is available for category: ${category}`);
  const ranked = eligible.map((activity) => scoreCandidate(activity, context))
    .sort((a, b) => b.score - a.score || a.activity.activityCode.localeCompare(b.activity.activityCode));
  const selected = ranked[0];
  return {
    recommendation: {
      activity_code: selected.activity.activityCode,
      category: selected.activity.category,
      activity_type: selected.activity.activityType,
      difficulty: selected.activity.difficulty,
      title: selected.activity.title,
      description: selected.activity.description,
      instructions: selected.activity.instructions,
      estimated_duration_minutes: selected.activity.estimatedDurationMinutes,
    },
    explanation: {
      finalEmotion: context.finalEmotionalState,
      finalConfidence: context.finalConfidence,
      riskLevel: context.riskLevel,
      conversationEngagement: context.conversationEngagement,
      selectedCategory: category,
      selectedActivity: selected.activity.activityCode,
      score: selected.score,
      reasons: selected.reasons,
      recentActivityHistory: context.recentActivityHistory || [],
    },
  };
}

module.exports = { CATEGORY_BY_EMOTION, WEIGHTS, desiredDifficulty, recommendActivity, scoreCandidate };
