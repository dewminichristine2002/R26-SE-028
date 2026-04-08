const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const {
  fetchProfile,
  saveProfile,
  fetchQuestionnaire,
  saveQuestionnaire,
  fetchCards,
  fetchCard,
  createCard,
  saveCard,
  fetchHistory,
  createReaction,
  analyzeMedicine,
} = require('../controllers/allergyController');

const router = express.Router();

router.use(requireDatabase);
router.use(requireAuth);

router.get('/profile', fetchProfile);
router.put('/profile', saveProfile);

router.get('/questionnaire', fetchQuestionnaire);
router.post('/questionnaire', saveQuestionnaire);

router.get('/cards', fetchCards);
router.post('/cards', createCard);
router.post('/analyze', analyzeMedicine);
router.get('/cards/:id', fetchCard);
router.put('/cards/:id', saveCard);

router.get('/history', fetchHistory);
router.post('/reactions', createReaction);

module.exports = router;
