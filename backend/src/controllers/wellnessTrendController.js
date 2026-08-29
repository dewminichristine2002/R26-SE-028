const repository = require('../repositories/wellnessTrendRepository');
const { buildCaregiverWellnessSummary, buildWellnessTrends, PERIOD_DAYS } = require('../services/wellnessTrendService');

async function loadTrends(req) {
  const userId = Number(req.params.userId);
  const period = req.query.period || '7d';
  if (!Number.isInteger(userId) || userId <= 0) throw Object.assign(new Error('userId must be a positive integer.'), { status: 400 });
  if (!PERIOD_DAYS[period]) throw Object.assign(new Error('period must be 7d or 30d.'), { status: 400 });
  const [sessions, activities, alerts] = await Promise.all([
    repository.getCompletedAdaptiveSessions(userId, 30),
    repository.getCompletedAdaptiveActivities(userId, 30),
    repository.getAdaptiveCaregiverAlerts(userId, 30),
  ]);
  return buildWellnessTrends({ userId, period, sessions, activities, alerts });
}

async function getWellnessTrends(req, res) {
  try { return res.json(await loadTrends(req)); }
  catch (error) { return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Failed to load wellness trends.' }); }
}

async function getWellnessSummary(req, res) {
  try { return res.json(buildCaregiverWellnessSummary(await loadTrends(req))); }
  catch (error) { return res.status(error.status || 500).json({ success: false, error: error.status ? error.message : 'Failed to load wellness summary.' }); }
}

module.exports = { getWellnessSummary, getWellnessTrends };
