function buildTrendSummary({ elderId }) {
  return {
    elderId,
    dominantEmotion7d: 'stressed',
    negativeMoodCount7d: 3,
    averageStressScore7d: 0.61,
    averageLonelinessScore7d: 0.39,
    openAlerts: 1,
  };
}

function buildHistory({ elderId, limit = 20 }) {
  return {
    elderId,
    limit,
    items: [],
  };
}

module.exports = {
  buildHistory,
  buildTrendSummary,
};
