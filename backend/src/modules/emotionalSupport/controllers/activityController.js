const {
  createActivityAttempt,
  getNextActivityByEmotion,
} = require('../repositories/activityRepository');

async function getNextActivity(req, res) {
  try {
    const emotion = req.query.emotion || 'neutral';
    const activity = await getNextActivityByEmotion(emotion);

    if (!activity) {
      return res.status(404).json({ error: 'No cognitive activity is available.' });
    }

    return res.json({
      elderId: req.params.elderId,
      activityId: activity.id,
      ...activity,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch next activity.',
      details: error.message,
    });
  }
}

async function submitActivityAttempt(req, res) {
  try {
    const attempt = await createActivityAttempt({
      elderId: req.body.elderId,
      sessionId: req.body.sessionId,
      activityId: req.params.activityId,
      answerText: req.body.answerText,
      selectedOption: req.body.selectedOption,
      score: req.body.score,
      completionStatus: req.body.completionStatus,
    });

    return res.status(201).json({
      attemptId: attempt.id,
      saved: true,
      attempt,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to save activity attempt.',
      details: error.message,
    });
  }
}

module.exports = {
  getNextActivity,
  submitActivityAttempt,
};
