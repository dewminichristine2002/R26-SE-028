const repeatedConcernStates = ['loneliness', 'anxiety', 'sadness', 'cognitive_fog'];

function buildEmotionCounts(countRows) {
  return countRows.reduce((counts, row) => {
    counts[row.detected_emotional_state] = row.total;
    return counts;
  }, {});
}

function buildRepeatedConcernSummary(emotionCounts) {
  const states = repeatedConcernStates.filter((state) => Number(emotionCounts[state] || 0) >= 3);

  if (states.length === 0) {
    return {
      exists: false,
      states: [],
      message: 'No repeated emotional concern detected in the last 7 days.',
    };
  }

  return {
    exists: true,
    states,
    message: 'Repeated emotional or cognitive support needs were noticed in the last 7 days.',
  };
}

function buildTrendSummary({ userId, moodCheckins, narrativeLogs, emotionCountRows, caregiverAlerts }) {
  const emotionCounts = buildEmotionCounts(emotionCountRows);

  return {
    success: true,
    user_id: userId,
    mood_checkins: moodCheckins,
    narrative_logs: narrativeLogs,
    emotion_counts: emotionCounts,
    repeated_concern: buildRepeatedConcernSummary(emotionCounts),
    caregiver_alerts: caregiverAlerts,
  };
}

module.exports = {
  buildTrendSummary,
};
