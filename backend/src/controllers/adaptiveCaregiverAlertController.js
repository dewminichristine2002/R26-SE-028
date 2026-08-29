const { getAdaptiveCaregiverAlerts } = require('../repositories/adaptiveRiskRepository');

async function listUserCaregiverAlerts(req, res) {
  const userId = Number(req.params.userId);
  const period = req.query.period || '30d';
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, error: 'userId must be a positive integer.' });
  }
  if (!['7d', '30d'].includes(period)) {
    return res.status(400).json({ success: false, error: 'period must be 7d or 30d.' });
  }
  try {
    const alerts = await getAdaptiveCaregiverAlerts(userId, { days: Number(period.slice(0, -1)) });
    return res.json({ success: true, user_id: userId, period, alerts });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load caregiver alerts.', details: error.message });
  }
}

module.exports = { listUserCaregiverAlerts };
