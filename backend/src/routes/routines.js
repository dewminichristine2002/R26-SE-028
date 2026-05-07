const express = require('express');
const { fetchRoutine, updateRoutine } = require('../controllers/routineController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireDatabase } = require('../middleware/databaseMiddleware');

const router = express.Router();

router.use(requireDatabase);
router.get('/', requireAuth, fetchRoutine);
router.post('/', requireAuth, updateRoutine);

module.exports = router;
