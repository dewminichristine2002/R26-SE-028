const {
  getCaregiverElderDetail: fetchCaregiverElderDetail,
  getCaregiverElders: fetchCaregiverElders,
} = require('../repositories/caregiverRepository');

async function getCaregiverElders(req, res) {
  try {
    const items = await fetchCaregiverElders(req.params.caregiverId);
    return res.json({
      caregiverId: req.params.caregiverId,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch caregiver elders.',
      details: error.message,
    });
  }
}

async function getCaregiverElderDetail(req, res) {
  try {
    const detail = await fetchCaregiverElderDetail(
      req.params.caregiverId,
      req.params.elderId
    );

    if (!detail) {
      return res.status(404).json({ error: 'Elder profile not found for this caregiver.' });
    }

    return res.json(detail);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch caregiver elder detail.',
      details: error.message,
    });
  }
}

module.exports = {
  getCaregiverElderDetail,
  getCaregiverElders,
};
