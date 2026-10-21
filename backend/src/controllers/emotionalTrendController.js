const {
  getEmotionCountsLast7Days,
  getLatestCaregiverAlerts,
  getRecentMoodCheckins,
  getRecentNarrativeLogs,
} = require('../repositories/emotionalTrendRepository');
const { buildTrendSummary } = require('../services/emotionalTrendSummaryService');

function validateUserId(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return 'userId must be a positive integer.';
  }

  return null;
}

async function getUserTrends(req, res) {
  try {
    const userId = Number(req.params.userId);
    const validationError = validateUserId(userId);

    if (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError,
      });
    }

    // Read only from the new Component 4 tables to keep the legacy flow isolated.
    const [moodCheckins, narrativeLogs, emotionCountRows, caregiverAlerts] = await Promise.all([
      getRecentMoodCheckins(userId, 7),
      getRecentNarrativeLogs(userId, 7),
      getEmotionCountsLast7Days(userId),
      getLatestCaregiverAlerts(userId, 7),
    ]);

    return res.json(
      buildTrendSummary({
        userId,
        moodCheckins,
        narrativeLogs,
        emotionCountRows,
        caregiverAlerts,
      })
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch emotional trend summary.',
      details: error.message,
    });
  }
}

module.exports = {
  getUserTrends,
};
