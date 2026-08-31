const { computePreferenceBonus, normalizeFamily } = require('./activityPreferenceService');

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

/**
 * Safety eligibility gate. Every candidate that reaches scoring has already
 * passed this filter; preference bonuses are applied strictly afterwards so
 * they can never override safety routing.
 */
function isEligible(activity, context) {
  const category = CATEGORY_BY_EMOTION[context.finalEmotionalState];
  if (!category) throw new Error(`Unsupported final emotional state: ${context.finalEmotionalState}`);
  if (activity.category !== category) return false;
  const safetyRequiresEasy = context.riskLevel === 'high'
    || ['anxiety', 'anger', 'cognitive_fog'].includes(context.finalEmotionalState)
    || context.conversationEngagement === 'limited_engagement';
  if (safetyRequiresEasy && activity.difficulty !== 'easy') return false;
  if (context.finalEmotionalState === 'cognitive_fog') {
    const fogPreferred = new Set(['orientation_activity', 'word_category', 'simple_math', 'short_memory_recall']);
    if (!fogPreferred.has(normalizeFamily(activity.activityCode))) return false;
  }
  return true;
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
  const recentTypeIndex = recent.findIndex((code) => normalizeFamily(code) === normalizeFamily(activity.activityCode));
  const repetitionPenalty = recentIndex === 0 ? WEIGHTS.recentRepeat : recentIndex > 0 ? -Math.max(2, 8 - recentIndex * 2) : 0;
  const typeRepetitionPenalty = recentTypeIndex >= 0 ? -Math.max(1, 6 - recentTypeIndex) : 0;

  // Deterministic user-preference reward. Applied only to candidates that are
  // already safety-eligible and always smaller than the structural fit weights.
  const family = normalizeFamily(activity.activityCode);
  const preferenceEntry = context.preferenceProfile instanceof Map
    ? context.preferenceProfile.get(family) || null
    : null;
  const { bonus: preferenceBonus, breakdown: preferenceBreakdown } = computePreferenceBonus(
    preferenceEntry,
    context.now || new Date()
  );

  const reasons = {
    emotionCategoryMatch: activity.category === selectedCategory ? WEIGHTS.emotionCategoryMatch : 0,
    riskFit: isRiskMismatch ? 0 : WEIGHTS.riskFit,
    engagementFit: engagementFits ? WEIGHTS.engagementFit : 0,
    variety: recentTypeIndex < 0 ? WEIGHTS.variety : 0,
    difficultyFit: activity.difficulty === desired ? WEIGHTS.difficultyFit : 0,
    preferenceBonus,
    penalties: repetitionPenalty + typeRepetitionPenalty + (isRiskMismatch ? WEIGHTS.riskMismatch : 0),
  };
  return {
    activity,
    score: Object.values(reasons).reduce((sum, value) => sum + value, 0),
    reasons,
    metadata: {
      emotion_fit: reasons.emotionCategoryMatch,
      safety_fit: reasons.riskFit + (isRiskMismatch ? WEIGHTS.riskMismatch : 0),
      engagement_fit: reasons.engagementFit,
      difficulty_fit: reasons.difficultyFit,
      preference_bonus: preferenceBonus,
      variety_bonus: reasons.variety,
      repetition_penalty: repetitionPenalty + typeRepetitionPenalty,
      preference_breakdown: preferenceBreakdown,
    },
  };
}

function rankEligible(context) {
  if (!Array.isArray(context.activities) || !context.activities.length) throw new Error('No active routable activities are available.');
  const eligible = context.activities.filter((activity) => isEligible(activity, context));
  if (!eligible.length) {
    const category = CATEGORY_BY_EMOTION[context.finalEmotionalState];
    throw new Error(`No activity is available for category: ${category}`);
  }
  return eligible.map((activity) => scoreCandidate(activity, context))
    .sort((a, b) => b.score - a.score || a.activity.activityCode.localeCompare(b.activity.activityCode));
}

function publicActivity(activity) {
  return {
    activity_code: activity.activityCode,
    category: activity.category,
    activity_type: activity.activityType,
    difficulty: activity.difficulty,
    title: activity.title,
    description: activity.description,
    instructions: activity.instructions,
    estimated_duration_minutes: activity.estimatedDurationMinutes,
  };
}

function recommendActivity(context) {
  const ranked = rankEligible(context);
  const selected = ranked[0];

  // Alternative recommendation: the next best candidate that is still fully
  // safety/difficulty compatible (it comes from the same eligible set),
  // differs from the primary, ideally belongs to another activity family,
  // and is not recently over-repeated.
  const primaryFamily = normalizeFamily(selected.activity.activityCode);
  const alternative = ranked.slice(1).find((candidate) => (
    normalizeFamily(candidate.activity.activityCode) !== primaryFamily
  )) || ranked[1] || null;

  return {
    recommendation: publicActivity(selected.activity),
    alternative_recommendation: alternative ? publicActivity(alternative.activity) : null,
    explanation: {
      finalEmotion: context.finalEmotionalState,
      finalConfidence: context.finalConfidence,
      riskLevel: context.riskLevel,
      conversationEngagement: context.conversationEngagement,
      selectedCategory: CATEGORY_BY_EMOTION[context.finalEmotionalState],
      selectedActivity: selected.activity.activityCode,
      score: selected.score,
      reasons: selected.reasons,
      selectedMetadata: selected.metadata,
      alternativeActivity: alternative?.activity.activityCode || null,
      alternativeScore: alternative?.score ?? null,
      alternativeMetadata: alternative?.metadata || null,
      recentActivityHistory: context.recentActivityHistory || [],
    },
  };
}

module.exports = {
  CATEGORY_BY_EMOTION,
  WEIGHTS,
  desiredDifficulty,
  isEligible,
  recommendActivity,
  scoreCandidate,
};