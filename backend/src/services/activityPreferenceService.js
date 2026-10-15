/**
 * Deterministic activity preference learning.
 *
 * Learns simple, explainable user activity preferences from existing
 * historical attempt data. NO new ML model is involved — no collaborative
 * filtering, no reinforcement learning, no bandits.
 *
 * Preference signals used:
 * - voluntarily self-selected an activity  -> modest positive reward
 * - completed an activity                  -> small positive reward
 * - repeated voluntary selection of the same activity family -> capped reward
 *
 * Signals explicitly NOT used:
 * - accuracy alone is never treated as preference proof
 * - long response time is never interpreted as dislike
 *
 * Safety precedence: the bonus returned here is applied ONLY inside the
 * already safety-eligible candidate set in activityRecommendationService and
 * is strictly smaller than the emotion-category fit weight, so preference can
 * NEVER override safety routing.
 */

const PREFERENCE_RULES = Object.freeze({
  // Each distinct voluntary (self_selected) start of this family counts,
  // capped so a single family cannot dominate.
  voluntarySelectionBonusPerStart: 2,
  maxCountedVoluntaryStarts: 3,

  // Each completion of this family adds a smaller reward, also capped.
  completionBonusPerCompletion: 1,
  maxCountedCompletions: 3,

  // Hard cap on the total preference bonus. Kept deliberately below the
  // smallest structural fit weight (difficultyFit = 10) so preference only
  // breaks ties between equally safe candidates.
  maxPreferenceBonus: 8,

  // A family completed within this many hours counts as "very recently
  // used"; the recommendation layer applies its repetition penalty on top.
  veryRecentUseHours: 48,
});

function normalizeFamily(activityCode) {
  return String(activityCode || '').replace(/_(easy|medium)$/, '');
}

/**
 * Compute the deterministic preference bonus for one activity family.
 *
 * @param {object|null} profileEntry aggregated history for the family:
 *   { selfSelectedCount, recommendedStartedCount, completionCount, lastUsedAt }
 * @param {Date} [now]
 * @returns {{ bonus: number, breakdown: object }}
 */
function computePreferenceBonus(profileEntry, now = new Date()) {
  if (!profileEntry) {
    return {
      bonus: 0,
      breakdown: {
        voluntary_selection_bonus: 0,
        completion_bonus: 0,
        capped_at: PREFERENCE_RULES.maxPreferenceBonus,
        very_recent_use: false,
      },
    };
  }

  const countedVoluntary = Math.min(
    PREFERENCE_RULES.maxCountedVoluntaryStarts,
    Math.max(0, Number(profileEntry.selfSelectedCount) || 0)
  );
  const countedCompletions = Math.min(
    PREFERENCE_RULES.maxCountedCompletions,
    Math.max(0, Number(profileEntry.completionCount) || 0)
  );

  const rawBonus =
    countedVoluntary * PREFERENCE_RULES.voluntarySelectionBonusPerStart +
    countedCompletions * PREFERENCE_RULES.completionBonusPerCompletion;
  const bonus = Math.min(PREFERENCE_RULES.maxPreferenceBonus, rawBonus);

  let veryRecentUse = false;
  if (profileEntry.lastUsedAt) {
    const lastUsed = new Date(profileEntry.lastUsedAt).getTime();
    if (Number.isFinite(lastUsed)) {
      veryRecentUse =
        now.getTime() - lastUsed <= PREFERENCE_RULES.veryRecentUseHours * 3600000;
    }
  }

  return {
    bonus,
    breakdown: {
      voluntary_selection_bonus: countedVoluntary * PREFERENCE_RULES.voluntarySelectionBonusPerStart,
      completion_bonus: countedCompletions * PREFERENCE_RULES.completionBonusPerCompletion,
      capped_at: PREFERENCE_RULES.maxPreferenceBonus,
      very_recent_use: veryRecentUse,
    },
  };
}

/**
 * Build a lookup map keyed by activity family (activity_type with any
 * _easy/_medium suffix removed) from repository rows.
 *
 * @param {Array<{activityType: string, activitySource: string, completionStatus: string, startedAt: string|Date, completedAt: string|Date|null}>} attempts
 * @returns {Map<string, {selfSelectedCount:number, recommendedStartedCount:number, completionCount:number, lastUsedAt:string|null}>}
 */
function buildPreferenceProfile(attempts = []) {
  const profile = new Map();
  (Array.isArray(attempts) ? attempts : []).forEach((attempt) => {
    const family = normalizeFamily(attempt.activityType || attempt.activityCode);
    if (!family) return;
    const entry = profile.get(family) || {
      selfSelectedCount: 0,
      recommendedStartedCount: 0,
      completionCount: 0,
      lastUsedAt: null,
    };

    const startedAt = attempt.startedAt ? new Date(attempt.startedAt).toISOString() : null;
    if (attempt.activitySource === 'self_selected') entry.selfSelectedCount += 1;
    else entry.recommendedStartedCount += 1;
    if (attempt.completionStatus === 'completed') entry.completionCount += 1;

    const latest = [entry.lastUsedAt, startedAt, attempt.completedAt ? new Date(attempt.completedAt).toISOString() : null]
      .filter(Boolean)
      .sort()
      .pop();
    entry.lastUsedAt = latest || null;
    profile.set(family, entry);
  });
  return profile;
}

module.exports = {
  PREFERENCE_RULES,
  buildPreferenceProfile,
  computePreferenceBonus,
  normalizeFamily,
};