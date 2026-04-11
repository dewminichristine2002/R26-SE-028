const express = require('express');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const { requireAuth } = require('../middleware/authMiddleware');
const { searchMedications, enrichMedication } = require('../services/medicationKnowledgeService');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'Medications route ready' });
});

router.use(requireDatabase);
router.use(requireAuth);

router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  return res.json({
    results: searchMedications(query),
  });
});

router.get('/knowledge', (req, res) => {
  const medicineName = String(req.query.medicineName || '').trim();
  const currentMedicationsText = String(req.query.currentMedicationsText || '').trim();
  const symptomMatch = String(req.query.symptomMatch || '').trim();

  if (!medicineName) {
    return res.status(400).json({ error: 'medicineName query parameter is required' });
  }

  return res.json({
    knowledge: enrichMedication({
      medicineName,
      currentMedicationsText,
      symptomMatch,
    }),
  });
});

module.exports = router;
