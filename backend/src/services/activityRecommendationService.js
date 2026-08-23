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

function desiredDifficulty({ finalEmotionalState, riskLevel, conversationEngagement }) {
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
  const reasons = {
    emotionCategoryMatch: activity.category === selectedCategory ? WEIGHTS.emotionCategoryMatch : 0,
    riskFit: isRiskMismatch ? 0 : WEIGHTS.riskFit,
    engagementFit: engagementFits ? WEIGHTS.engagementFit : 0,
    variety: recent[0] !== activity.activityCode ? WEIGHTS.variety : 0,
    difficultyFit: activity.difficulty === desired ? WEIGHTS.difficultyFit : 0,
    penalties: (recent[0] === activity.activityCode ? WEIGHTS.recentRepeat : 0) + (isRiskMismatch ? WEIGHTS.riskMismatch : 0),
  };
  return { activity, score: Object.values(reasons).reduce((sum, value) => sum + value, 0), reasons };
}

function recommendActivity(context) {
  if (!Array.isArray(context.activities) || !context.activities.length) throw new Error('No active routable activities are available.');
  const category = CATEGORY_BY_EMOTION[context.finalEmotionalState];
  const eligible = context.activities.filter((activity) => activity.category === category);
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
