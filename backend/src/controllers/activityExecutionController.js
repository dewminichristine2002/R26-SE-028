const repository = require('../repositories/activityExecutionRepository');
const { scoreObjectiveResponse } = require('../services/cognitiveActivityScoringService');
const { recommendNextDifficulty } = require('../services/cognitiveDifficultyService');

function publicTask(attempt) {
  const task = attempt.taskSnapshot;
  if (!task) return null;
  const { correctAnswer: _correctAnswer, correctAnswers: _correctAnswers, ...safeTask } = task;
  return safeTask;
}

async function startActivity(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const sessionId = String(req.body?.session_id || '').trim();
    const activityCode = String(req.body?.activity_code || '').trim();
    if (!Number.isInteger(userId) || userId <= 0 || !sessionId || !activityCode) return res.status(400).json({ success: false, error: 'user_id, session_id, and activity_code are required.' });
    const attempt = await repository.startActivityAttempt({ userId, sessionId, activityCode });
    return res.status(attempt.reused ? 200 : 201).json({ success: true, attempt_id: attempt.attemptId, category: attempt.category, activity_code: attempt.activityCode, activity_type: attempt.activityType, difficulty: attempt.difficulty, started_at: attempt.startedAt, task: publicTask(attempt), reused: Boolean(attempt.reused) });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Failed to start activity.' });
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
        difficulty = recommendNextDifficulty({ currentDifficulty: attempt.difficulty, accuracy: scored.accuracy, responseTime: responseTimeMs, completionStatus: 'completed', finalEmotionalState: attempt.finalEmotionalState, riskLevel: attempt.riskLevel, conversationEngagement: attempt.conversationEngagement, recentCognitiveAttempts });
      }
      return repository.completeAttempt(client, { attemptId: attempt.attemptId, response: scored.normalizedResponse, isCorrect: scored.isCorrect, accuracy: scored.accuracy, responseTimeMs, nextDifficulty: difficulty.nextDifficulty, explanation: difficulty.explanation });
    });
    return res.json({ success: true, completed: true, attempt_id: result.attemptId, activity_code: result.activityCode, activity_type: result.activityType, category: result.category, difficulty: result.difficulty, accuracy: result.accuracy, is_correct: result.isCorrect, response_time_ms: result.responseTimeMs, duration_seconds: Number((result.responseTimeMs / 1000).toFixed(1)), completion_status: result.completionStatus, next_difficulty: result.nextDifficulty, feedback: result.accuracy == null ? 'Activity complete. Thank you for taking part.' : result.isCorrect ? 'Nice work — you completed that activity.' : "Good try. Let's keep it simple and continue." });
  } catch (error) {
    const status = error.status || (/valid|supported|required/i.test(error.message) ? 400 : 500);
    return res.status(status).json({ success: false, error: status === 500 ? 'Failed to complete activity.' : error.message });
  }
}

module.exports = { startActivity, submitActivity };
