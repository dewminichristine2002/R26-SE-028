const {
  PREFERENCE_RULES,
  buildPreferenceProfile,
  computePreferenceBonus,
  normalizeFamily,
} = require('../activityPreferenceService');

describe('deterministic activity preference learning', () => {
  test('repeated voluntary self-selection earns a modest, capped bonus', () => {
    const profile = buildPreferenceProfile([
      { activityType: 'word_completion_easy', activitySource: 'self_selected', completionStatus: 'completed' },
      { activityType: 'word_completion_medium', activitySource: 'self_selected', completionStatus: 'completed' },
      { activityType: 'word_completion_easy', activitySource: 'self_selected', completionStatus: 'completed' },
    ]);
    const { bonus } = computePreferenceBonus(profile.get('word_completion'));
    expect(bonus).toBeGreaterThan(0);
    expect(bonus).toBeLessThanOrEqual(PREFERENCE_RULES.maxPreferenceBonus);
  });

  test('bonus is capped so preference can never dominate structural fit weights', () => {
    const attempts = Array.from({ length: 20 }, (_value, index) => ({
      activityType: `word_completion_${index % 2 ? 'medium' : 'easy'}`,
      activitySource: 'self_selected',
      completionStatus: 'completed',
    }));
    const profile = buildPreferenceProfile(attempts);
    const { bonus } = computePreferenceBonus(profile.get('word_completion'));
    expect(bonus).toBe(PREFERENCE_RULES.maxPreferenceBonus);
    expect(bonus).toBeLessThan(10); // smallest structural fit weight
  });

  test('accuracy and response time are never used as preference signals', () => {
    // The profile builder accepts only source/status/timestamps; accuracy-like
    // fields are ignored by design.
    const profile = buildPreferenceProfile([
      { activityType: 'odd_one_out_easy', activitySource: 'recommended', completionStatus: 'completed', accuracy: 1.0, responseTimeMs: 999999 },
    ]);
    const entry = profile.get('odd_one_out');
    expect(entry.selfSelectedCount).toBe(0);
    expect(entry.completionCount).toBe(1);
  });

  test('very recent use is flagged for the repetition penalty layer', () => {
    const now = new Date();
    const profile = buildPreferenceProfile([
      { activityType: 'word_completion_easy', activitySource: 'self_selected', completionStatus: 'completed', startedAt: new Date(now - 3600000).toISOString() },
    ]);
    const { breakdown } = computePreferenceBonus(profile.get('word_completion'), now);
    expect(breakdown.very_recent_use).toBe(true);
  });

  test('older use is not flagged as very recent', () => {
    const now = new Date();
    const profile = buildPreferenceProfile([
      { activityType: 'word_completion_easy', activitySource: 'self_selected', completionStatus: 'completed', startedAt: new Date(now - 14 * 86400000).toISOString() },
    ]);
    const { breakdown } = computePreferenceBonus(profile.get('word_completion'), now);
    expect(breakdown.very_recent_use).toBe(false);
  });

  test('empty history yields zero bonus without errors', () => {
    expect(computePreferenceBonus(null).bonus).toBe(0);
    expect(computePreferenceBonus(undefined).bonus).toBe(0);
    expect(buildPreferenceProfile([]).size).toBe(0);
  });

  test('family normalization strips difficulty suffixes', () => {
    expect(normalizeFamily('word_completion_easy')).toBe('word_completion');
    expect(normalizeFamily('word_completion_medium')).toBe('word_completion');
    expect(normalizeFamily('guided_breathing_easy')).toBe('guided_breathing');
  });
});