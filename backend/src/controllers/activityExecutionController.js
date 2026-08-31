const repository = require('../repositories/activityExecutionRepository');
const { scoreObjectiveResponse } = require('../services/cognitiveActivityScoringService');
const { recommendNextDifficulty } = require('../services/cognitiveDifficultyService');
const { buildPreferenceProfile } = require('../services/activityPreferenceService');
const { recommendActivity } = require('../services/activityRecommendationService');

function publicTask(attempt) {
  const task = attempt.taskSnapshot;
  if (!task) return null;
  const sanitize = (value) => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['correctAnswer', 'correctAnswers', 'correctOrder'].includes(key))
      .map(([key, child]) => [key, sanitize(child)]));
  };
  return sanitize(task);
}

async function startActivity(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const sessionId = String(req.body?.session_id || '').trim();
    const activityCode = String(req.body?.activity_code || '').trim();
    const activitySource = String(req.body?.activity_source || 'recommended').trim();
    if (!Number.isInteger(userId) || userId <= 0 || !activityCode) return res.status(400).json({ success: false, error: 'user_id and activity_code are required.' });
    if (!['recommended', 'self_selected'].includes(activitySource)) return res.status(400).json({ success: false, error: 'activity_source must be recommended or self_selected.' });
    if (activitySource === 'recommended' && !sessionId) return res.status(400).json({ success: false, error: 'session_id is required for a recommended activity.' });
    const attempt = activitySource === 'self_selected'
      ? await repository.startSelfSelectedActivityAttempt({ userId, activityCode })
      : await repository.startActivityAttempt({ userId, sessionId, activityCode });
    return res.status(attempt.reused ? 200 : 201).json({ success: true, attempt_id: attempt.attemptId, category: attempt.category, activity_code: attempt.activityCode, activity_type: attempt.activityType, activity_source: attempt.activitySource || activitySource, difficulty: attempt.difficulty, started_at: attempt.startedAt, task: publicTask(attempt), reused: Boolean(attempt.reused) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Failed to start activity.' });
  }
}

async function listCognitiveActivities(req, res) {
  try {
    const userId = Number(req.query?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    const [activities, recommendedDifficulty, recentAttempts] = await Promise.all([
      repository.listSelfSelectableActivities(),
      repository.getSelfSelectedDifficulty(userId),
      repository.getRecentCognitiveAttempts(userId, 20),
    ]);
    const normalizedActivities = activities.map((activity) => ({
      activityCode: activity.activityCode,
      title: activity.title,
      description: activity.description,
      instructions: activity.instructions,
      supportedDifficulties: activity.supportedDifficulties,
      difficulty: activity.supportedDifficulties.includes(recommendedDifficulty) ? recommendedDifficulty : 'easy',
      estimatedDurationMinutes: activity.estimatedDurationMinutes,
      category: 'cognitive_engagement',
      activityType: activity.activityCode,
    }));
    const profile = buildPreferenceProfile((Array.isArray(recentAttempts) ? recentAttempts : []).map((attempt) => ({
      activityType: attempt.activityType || attempt.activityCode,
      activityCode: attempt.activityCode,
      activitySource: attempt.activitySource || 'self_selected',
      completionStatus: attempt.completionStatus || 'completed',
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
    })));
    const recentActivityHistory = (Array.isArray(recentAttempts) ? recentAttempts : [])
      .map((attempt) => attempt.activityType || attempt.activityCode)
      .filter(Boolean)
      .slice(0, 8);
    const recommendation = recommendActivity({
      finalEmotionalState: 'neutral',
      finalConfidence: 0.8,
      riskLevel: 'low',
      conversationEngagement: 'engaged',
      recentActivityHistory,
      preferenceProfile: profile,
      activities: normalizedActivities,
    });
    const recommendedActivity = recommendation?.recommendation || null;
    return res.json({
      success: true,
      count: activities.length,
      recommended_activity: recommendedActivity ? {
        activity_code: recommendedActivity.activity_code,
        activity_type: recommendedActivity.activity_type,
        title: recommendedActivity.title,
        description: recommendedActivity.description,
        instructions: recommendedActivity.instructions,
        recommended_difficulty: recommendedActivity.difficulty,
        estimated_duration_minutes: recommendedActivity.estimated_duration_minutes,
        category: recommendedActivity.category,
      } : null,
      activities: activities.map((activity) => ({
        activity_code: activity.activityCode,
        title: activity.title,
        description: activity.description,
        instructions: activity.instructions,
        supported_difficulties: activity.supportedDifficulties,
        recommended_difficulty: activity.supportedDifficulties.includes(recommendedDifficulty) ? recommendedDifficulty : 'easy',
        estimated_duration_minutes: activity.estimatedDurationMinutes,
        category: 'cognitive_engagement',
      })),
    });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to load cognitive activities.' });
  }
}

async function submitActivity(req, res) {
  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
  try {
    const result = await repository.withTransaction(async (client) => {
      const attempt = await repository.getAttemptForUpdate(client, req.params.attemptId, userId);
      if (!attempt) throw Object.assign(new Error('Activity attempt was not found.'), { status: 404 });
      if (attempt.completedAt) throw Object.assign(new Error('This attempt has already been completed.'), { status: 409 });
      const responseTimeMs = Math.max(0, Math.round(Date.now() - new Date(attempt.startedAt).getTime()));
      let scored = { accuracy: null, isCorrect: null, normalizedResponse: req.body?.response || {} };
      let difficulty = { nextDifficulty: attempt.difficulty, explanation: { reasons: ['non_objective_activity_not_scored'], responseTimeUsedForDecision: false } };
      if (attempt.category === 'cognitive_engagement') {
        scored = scoreObjectiveResponse(attempt.taskSnapshot, req.body?.response);
        const recentCognitiveAttempts = await repository.getRecentCognitiveAttempts(userId, 5, client);
        difficulty = recommendNextDifficulty({ currentDifficulty: attempt.difficulty, currentActivityType: attempt.activityType, accuracy: scored.accuracy, responseTime: responseTimeMs, completionStatus: 'completed', finalEmotionalState: attempt.finalEmotionalState, riskLevel: attempt.riskLevel, conversationEngagement: attempt.conversationEngagement, recentCognitiveAttempts });
      }
      return repository.completeAttempt(client, { attemptId: attempt.attemptId, response: scored.normalizedResponse, isCorrect: scored.isCorrect, accuracy: scored.accuracy, responseTimeMs, nextDifficulty: difficulty.nextDifficulty, explanation: difficulty.explanation });
    });
    const completedItems = Array.isArray(result.response?.itemResponses) ? result.response.itemResponses.length : undefined;
    return res.json({ success: true, completed: true, attempt_id: result.attemptId, activity_code: result.activityCode, activity_type: result.activityType, activity_source: result.activitySource || 'recommended', category: result.category, difficulty: result.difficulty, accuracy: result.accuracy, is_correct: result.isCorrect, response_time_ms: result.responseTimeMs, duration_seconds: Number((result.responseTimeMs / 1000).toFixed(1)), completion_status: result.completionStatus, next_difficulty: result.nextDifficulty, completed_items: completedItems, total_items: completedItems, feedback: result.accuracy == null ? 'Activity complete. Thank you for taking part.' : result.isCorrect ? 'Nice work! You completed every activity item.' : "Good try. You've completed the activity." });
  } catch (error) {
    const status = error.status || (/valid|supported|required/i.test(error.message) ? 400 : 500);
    if (status === 500) console.error('Activity submission failed:', {
      attemptId: req.params.attemptId, userId, code: error.code, message: error.message,
    });
    return res.status(status).json({ success: false, error: status === 500 ? 'Failed to complete activity.' : error.message });
  }
}

module.exports = { listCognitiveActivities, publicTask, startActivity, submitActivity };
