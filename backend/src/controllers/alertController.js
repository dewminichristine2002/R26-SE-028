const {
  acknowledgeAlert: persistAlertAcknowledgement,
  getCaregiverAlerts: fetchCaregiverAlerts,
} = require('../repositories/alertRepository');

async function getCaregiverAlerts(req, res) {
  try {
    const items = await fetchCaregiverAlerts(
      req.params.caregiverId,
      req.query.status || 'open'
    );

    return res.json({
      caregiverId: req.params.caregiverId,
      status: req.query.status || 'open',
      items,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch caregiver alerts.',
      details: error.message,
    });
  }
}

async function acknowledgeAlert(req, res) {
  try {
    const updated = await persistAlertAcknowledgement(
      req.params.alertId,
      req.body.caregiverId
    );

    if (!updated) {
      return res.status(404).json({ error: 'Alert not found for this caregiver.' });
    }

    return res.json(updated);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to acknowledge alert.',
      details: error.message,
    });
  }
}

module.exports = {
  acknowledgeAlert,
  getCaregiverAlerts,
};
