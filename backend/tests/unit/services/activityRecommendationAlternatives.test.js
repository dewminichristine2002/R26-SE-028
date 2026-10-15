const { recommendActivity, isEligible } = require('../../../src/services/activityRecommendationService');
const { buildPreferenceProfile } = require('../../../src/services/activityPreferenceService');

const activities = [
  ['word_category_easy', 'cognitive_engagement', 'word_category', 'easy', 2],
  ['odd_one_out_easy', 'cognitive_engagement', 'odd_one_out', 'easy', 2],
  ['word_completion_easy', 'cognitive_engagement', 'word_completion', 'easy', 2],
  ['pattern_sequence_medium', 'cognitive_engagement', 'pattern_sequence', 'medium', 3],
  ['short_memory_recall_easy', 'cognitive_engagement', 'short_memory_recall', 'easy', 2],
  ['orientation_activity_easy', 'cognitive_engagement', 'orientation_activity', 'easy', 2],
  ['simple_math_easy', 'cognitive_engagement', 'simple_math', 'easy', 2],
  ['positive_reminiscence_easy', 'reminiscence_engagement', 'happy_event_recall', 'easy', 3],
  ['guided_breathing_easy', 'calming_support', 'guided_breathing', 'easy', 2],
  ['gentle_pause_easy', 'calming_support', 'gentle_pause', 'easy', 1],
].map(([activityCode, category, activityType, difficulty, estimatedDurationMinutes]) => ({
  activityCode, category, activityType, difficulty, estimatedDurationMinutes,
  title: activityCode, description: 'Safe predefined activity', instructions: 'Follow the short predefined steps.',
}));

function context(finalEmotionalState, overrides = {}) {
  return {
    finalEmotionalState,
    finalConfidence: 0.6,
    riskLevel: 'low',
    conversationEngagement: 'engaged',
    recentActivityHistory: [],
    activities,
    ...overrides,
  };
}

describe('primary + alternative activity recommendation', () => {
  test('alternative differs from primary and both satisfy the same safety constraints', () => {
    const result = recommendActivity(context('neutral'));
    expect(result.recommendation.activity_code).toBeDefined();
    expect(result.alternative_recommendation).toBeTruthy();
    expect(result.alternative_recommendation.activity_code).not.toBe(result.recommendation.activity_code);
    expect(result.alternative_recommendation.category).toBe(result.recommendation.category);
    expect(result.alternative_recommendation.difficulty).toBe('easy');
  });

  test('high-risk users receive only easy-compatible options in BOTH slots', () => {
    const result = recommendActivity(context('happiness', { riskLevel: 'high' }));
    expect(result.recommendation.difficulty).toBe('easy');
    if (result.alternative_recommendation) {
      expect(result.alternative_recommendation.difficulty).toBe('easy');
    }
  });

  test('anxiety restricts both recommendations to easy calming support', () => {
    const result = recommendActivity(context('anxiety', { riskLevel: 'medium' }));
    expect(result.recommendation.category).toBe('calming_support');
    expect(result.recommendation.difficulty).toBe('easy');
    expect(result.alternative_recommendation?.category).toBe('calming_support');
    expect(result.alternative_recommendation?.difficulty).toBe('easy');
  });

  test('limited engagement keeps both options short and easy', () => {
    const result = recommendActivity(context('neutral', { conversationEngagement: 'limited_engagement' }));
    [result.recommendation, result.alternative_recommendation].filter(Boolean).forEach((option) => {
      expect(option.difficulty).toBe('easy');
      expect(option.estimated_duration_minutes).toBeLessThanOrEqual(2);
    });
  });

  test('single eligible option degrades gracefully with a null alternative', () => {
    const singleOption = [{
      activityCode: 'guided_breathing_easy', category: 'calming_support', activityType: 'guided_breathing',
      difficulty: 'easy', estimatedDurationMinutes: 2, title: 'Slow Breathing Pause',
      description: 'A short guided breathing pause.', instructions: 'Breathe gently.',
    }];
    const result = recommendActivity(context('anxiety', { riskLevel: 'medium', activities: singleOption }));
    expect(result.recommendation.activity_code).toBe('guided_breathing_easy');
    expect(result.alternative_recommendation).toBeNull();
  });

  test('alternative prefers another activity family when one exists', () => {
    const result = recommendActivity(context('neutral'));
    const primaryFamily = result.recommendation.activity_type;
    // With the full bank available the alternative should come from a
    // different family whenever possible.
    expect(result.alternative_recommendation.activity_type).not.toBe(primaryFamily);
  });

  test('recommendation remains deterministic with preference data present', () => {
    const profile = buildPreferenceProfile([
      { activityType: 'odd_one_out_easy', activitySource: 'self_selected', completionStatus: 'completed' },
    ]);
    const input = context('neutral', { preferenceProfile: profile });
    expect(recommendActivity(input)).toEqual(recommendActivity(input));
  });
});

describe('preference-aware scoring with safety precedence', () => {
  test('user who repeatedly self-selected Word Completion receives a preference bonus later', () => {
    const profile = buildPreferenceProfile([
      { activityType: 'word_completion_easy', activitySource: 'self_selected', completionStatus: 'completed' },
      { activityType: 'word_completion_medium', activitySource: 'self_selected', completionStatus: 'completed' },
    ]);
    const withoutPreference = recommendActivity(context('neutral'));
    const withPreference = recommendActivity(context('neutral', { preferenceProfile: profile }));
    expect(withPreference.explanation.selectedMetadata.preference_bonus).toBeGreaterThan(0);
    expect(withoutPreference.explanation.selectedMetadata.preference_bonus).toBe(0);
  });

  test('a strongly preferred family can rise to primary within the safe set', () => {
    const profile = buildPreferenceProfile(
      Array.from({ length: 6 }, (_value, index) => ({
        activityType: index % 2 ? 'word_completion_medium' : 'word_completion_easy',
        activitySource: 'self_selected',
        completionStatus: 'completed',
      }))
    );
    const result = recommendActivity(context('neutral', { preferenceProfile: profile }));
    expect(result.recommendation.activity_code).toBe('word_completion_easy');
  });

  test('very recent use of the preferred family still lets repetition penalty favor another safe activity', () => {
    const profile = buildPreferenceProfile(
      Array.from({ length: 6 }, (_value, index) => ({
        activityType: index % 2 ? 'word_completion_medium' : 'word_completion_easy',
        activitySource: 'self_selected',
        completionStatus: 'completed',
      }))
    );
    const result = recommendActivity(context('neutral', {
      preferenceProfile: profile,
      recentActivityHistory: ['word_completion_easy'],
    }));
    expect(result.recommendation.activity_code).not.toBe('word_completion_easy');
  });

  test('preference NEVER overrides safety: an ineligible preferred activity cannot be chosen', () => {
    // Strong preference for pattern_sequence (medium) while high risk forces easy.
    const profile = buildPreferenceProfile(
      Array.from({ length: 10 }, (_value, index) => ({
        activityType: `pattern_sequence_${index % 2 ? 'medium' : 'easy'}`,
        activitySource: 'self_selected',
        completionStatus: 'completed',
      }))
    );
    const result = recommendActivity(context('happiness', { riskLevel: 'high', preferenceProfile: profile }));
    expect(result.recommendation.difficulty).toBe('easy');
    expect(result.recommendation.activity_code).not.toBe('pattern_sequence_medium');
    if (result.alternative_recommendation) {
      expect(result.alternative_recommendation.difficulty).toBe('easy');
    }
  });

  test('ineligible-category activities are excluded by the eligibility gate regardless of preference', () => {
    const calmingOnly = activities.filter((activity) => activity.category === 'calming_support');
    const profile = buildPreferenceProfile([
      { activityType: 'guided_breathing_easy', activitySource: 'self_selected', completionStatus: 'completed' },
    ]);
    // Neutral routes to cognitive_engagement; calming candidates must never win.
    calmingOnly.forEach((activity) => {
      expect(isEligible(activity, context('neutral'))).toBe(false);
    });
    const result = recommendActivity(context('neutral', { preferenceProfile: profile }));
    expect(result.recommendation.category).toBe('cognitive_engagement');
  });

  test('explanation metadata exposes explainable components without technical leakage to elders', () => {
    const result = recommendActivity(context('sadness'));
    const metadata = result.explanation.selectedMetadata;
    expect(metadata).toHaveProperty('emotion_fit');
    expect(metadata).toHaveProperty('safety_fit');
    expect(metadata).toHaveProperty('difficulty_fit');
    expect(metadata).toHaveProperty('preference_bonus');
    expect(metadata).toHaveProperty('variety_bonus');
    expect(metadata).toHaveProperty('repetition_penalty');
  });
});