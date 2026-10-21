const { getRoutine, saveRoutine } = require('../models/routineModel');

const DEFAULTS = {
  breakfast: '08:00 AM',
  lunch: '01:00 PM',
  dinner: '07:00 PM',
  sleep: '10:30 PM',
};

const normalizeMealTimes = (input = {}) => ({
  breakfast: typeof input.breakfast === 'string' ? input.breakfast : DEFAULTS.breakfast,
  lunch: typeof input.lunch === 'string' ? input.lunch : DEFAULTS.lunch,
  dinner: typeof input.dinner === 'string' ? input.dinner : DEFAULTS.dinner,
  sleep: typeof input.sleep === 'string' ? input.sleep : DEFAULTS.sleep,
});

const fetchRoutine = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    console.log('[RoutineController] GET request for user:', userId);
    const routine = await getRoutine(userId);
    console.log('[RoutineController] GET response:', routine);
    res.json(routine);
  } catch (error) {
    console.error('[RoutineController] GET error:', error);
    next(error);
  }
};

const updateRoutine = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { mealTimes } = req.body || {};
    console.log('[RoutineController] POST request for user:', userId);
    console.log('[RoutineController] POST request body:', req.body);
    console.log('[RoutineController] Received mealTimes:', mealTimes);

    if (!mealTimes || typeof mealTimes !== 'object') {
      console.error('[RoutineController] Invalid mealTimes format');
      return res.status(400).json({ error: 'mealTimes object is required' });
    }

    const normalized = normalizeMealTimes(mealTimes);
    console.log('[RoutineController] Normalized mealTimes:', normalized);
    const updatedRoutine = await saveRoutine(userId, normalized);
    console.log('[RoutineController] POST response:', updatedRoutine);
    return res.status(200).json(updatedRoutine);
  } catch (error) {
    console.error('[RoutineController] POST error:', error);
    return next(error);
  }
};

module.exports = {
  fetchRoutine,
  updateRoutine,
};
