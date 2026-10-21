const express = require('express');
const { fetchRoutine, updateRoutine } = require('../controllers/routineController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, fetchRoutine);
router.post('/', requireAuth, updateRoutine);

module.exports = router;
