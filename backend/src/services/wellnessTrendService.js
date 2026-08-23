const EMOTIONS = Object.freeze(['happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral']);
const PERIOD_DAYS = Object.freeze({ '7d': 7, '30d': 30 });

function round(value, places = 4) { return Number(Number(value).toFixed(places)); }
function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }
function withinPeriod(value, days, now) { const time = new Date(value).getTime(); return Number.isFinite(time) && time >= now.getTime() - days * 86400000 && time <= now.getTime(); }

function buildWellnessTrends({ userId, period = '7d', sessions = [], activities = [], alerts = [], now = new Date() }) {
  const days = PERIOD_DAYS[period];
  if (!days) throw new Error('period must be 7d or 30d.');
  const validSessions = sessions.filter((item) => item.isComplete !== false && EMOTIONS.includes(item.finalEmotionalState) && item.completedAt && withinPeriod(item.completedAt, days, now)).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const validActivities = activities.filter((item) => item.completionStatus === 'completed' && item.completedAt && withinPeriod(item.completedAt, days, now)).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const counts = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0]));
  validSessions.forEach((session) => { counts[session.finalEmotionalState] += 1; });
  const distribution = EMOTIONS.map((emotion) => ({ emotion, count: counts[emotion], percentage: validSessions.length ? round((counts[emotion] / validSessions.length) * 100, 1) : 0 }));
  const maxCount = Math.max(0, ...Object.values(counts));
  const tied = new Set(EMOTIONS.filter((emotion) => counts[emotion] === maxCount && maxCount > 0));
  const mostFrequentEmotion = validSessions.find((session) => tied.has(session.finalEmotionalState))?.finalEmotionalState || null;
  const latestByDate = new Map();
  validSessions.forEach((session) => { const key = dateKey(session.completedAt); if (!latestByDate.has(key)) latestByDate.set(key, session); });
  const timeline = [...latestByDate.entries()].map(([date, session]) => ({ date, emotion: session.finalEmotionalState, risk: session.riskLevel, completed_at: session.completedAt })).reverse();
  const riskCounts = { low: 0, medium: 0, high: 0 };
  validSessions.forEach((session) => { if (riskCounts[session.riskLevel] != null) riskCounts[session.riskLevel] += 1; });

  const cognitive = validActivities.filter((item) => item.category === 'cognitive_engagement');
  const scored = cognitive.filter((item) => item.accuracy != null && Number.isFinite(Number(item.accuracy)));
  const timed = cognitive.filter((item) => Number.isInteger(Number(item.responseTimeMs)) && Number(item.responseTimeMs) >= 0);
  const averageAccuracy = scored.length ? round(scored.reduce((sum, item) => sum + Number(item.accuracy), 0) / scored.length) : null;
  const averageResponseTime = timed.length ? Math.round(timed.reduce((sum, item) => sum + Number(item.responseTimeMs), 0) / timed.length) : null;
  const activityTypeCounts = {};
  cognitive.forEach((item) => { activityTypeCounts[item.activityType] = (activityTypeCounts[item.activityType] || 0) + 1; });
  const categoryCounts = { cognitive_engagement: 0, reminiscence_engagement: 0, calming_support: 0 };
  validActivities.forEach((item) => { if (categoryCounts[item.category] != null) categoryCounts[item.category] += 1; });
  const durationByCategory = { reminiscence_engagement: 0, calming_support: 0 };
  validActivities.forEach((item) => { if (durationByCategory[item.category] != null && Number(item.responseTimeMs) >= 0) durationByCategory[item.category] += Number(item.responseTimeMs); });
  const activeDates = new Set([...validSessions.map((item) => dateKey(item.completedAt)), ...validActivities.map((item) => dateKey(item.completedAt))]);
  const alertRows = alerts.filter((item) => item.createdAt && withinPeriod(item.createdAt, days, now));

  return {
    success: true, user_id: userId, period, period_days: days,
    emotional: { total_checkins: validSessions.length, most_frequent_emotion: mostFrequentEmotion, recent_emotion: validSessions[0]?.finalEmotionalState || null, distribution, timeline, risk_counts: riskCounts },
    activities: {
      total_completed: validActivities.length,
      cognitive_completed: categoryCounts.cognitive_engagement,
      reminiscence_completed: categoryCounts.reminiscence_engagement,
      calming_completed: categoryCounts.calming_support,
      days_active: activeDates.size,
      reminiscence: { completed_count: categoryCounts.reminiscence_engagement, total_duration_ms: durationByCategory.reminiscence_engagement, recent_activity: validActivities.find((item) => item.category === 'reminiscence_engagement')?.activityCode || null },
      calming: { completed_count: categoryCounts.calming_support, total_duration_ms: durationByCategory.calming_support, recent_activity: validActivities.find((item) => item.category === 'calming_support')?.activityCode || null },
      recent_activity_log: validActivities.slice(0, 20).map((item) => ({ date: dateKey(item.completedAt), completed_at: item.completedAt, activity_code: item.activityCode, activity_type: item.activityType, category: item.category, difficulty: item.difficulty, accuracy: item.category === 'cognitive_engagement' ? item.accuracy : null, response_time_ms: item.responseTimeMs })),
    },
    cognitive_engagement: {
      activities_completed: cognitive.length, scored_activities: scored.length,
      average_activity_accuracy: averageAccuracy,
      recent_activity_accuracy: scored[0]?.accuracy == null ? null : Number(scored[0].accuracy),
      average_response_time_ms: averageResponseTime,
      recent_difficulty: cognitive[0]?.difficulty || null,
      easy_attempt_count: cognitive.filter((item) => item.difficulty === 'easy').length,
      medium_attempt_count: cognitive.filter((item) => item.difficulty === 'medium').length,
      activity_type_distribution: activityTypeCounts,
      accuracy_history: scored.map((item) => ({ date: dateKey(item.completedAt), activity_code: item.activityCode, activity_type: item.activityType, difficulty: item.difficulty, accuracy: Number(item.accuracy) })).reverse(),
      difficulty_history: cognitive.map((item) => ({ date: dateKey(item.completedAt), activity_code: item.activityCode, activity_type: item.activityType, difficulty: item.difficulty })).reverse(),
    },
    caregiver: {
      alerts_generated: alertRows.length,
      alerts: alertRows.map((item) => ({
        alert_id: item.alertId,
        adaptive_session_id: item.adaptiveSessionId || null,
        alert_type: item.alertType || null,
        emotional_state: item.emotionalState || null,
        risk_level: item.riskLevel || item.severity || null,
        occurrences: item.occurrences == null ? null : Number(item.occurrences),
        status: item.status || (item.isAcknowledged ? 'acknowledged' : 'unread'),
        message: item.message || null,
        created_at: item.createdAt,
      })),
    },
  };
}

function buildCaregiverWellnessSummary(trends) {
  return {
    success: true, title: 'Wellness Summary', period: trends.period,
    checkins_completed: trends.emotional.total_checkins,
    emotion_distribution: trends.emotional.distribution,
    most_frequent_emotional_state: trends.emotional.most_frequent_emotion,
    activities_completed: trends.activities.total_completed,
    cognitive_activity_accuracy_summary: { scored_activities: trends.cognitive_engagement.scored_activities, average_activity_accuracy: trends.cognitive_engagement.average_activity_accuracy },
    activity_difficulty_history: trends.cognitive_engagement.difficulty_history,
    caregiver_alerts_generated: trends.caregiver.alerts_generated,
    caregiver_alerts: trends.caregiver.alerts,
    disclaimer: 'This summary reflects app-based emotional check-ins and engagement activities. It is not a medical diagnosis.',
  };
}

module.exports = { EMOTIONS, PERIOD_DAYS, buildCaregiverWellnessSummary, buildWellnessTrends };
