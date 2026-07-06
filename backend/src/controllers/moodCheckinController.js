const { createMoodCheckin: insertMoodCheckin } = require('../repositories/moodCheckinRepository');

function validateMoodCheckinPayload(body) {
  const errors = [];
  const userId = Number(body.user_id);
  const moodLabel = typeof body.mood_label === 'string' ? body.mood_label.trim() : '';
  const moodScore = Number(body.mood_score);
  const reflectionText =
    typeof body.reflection_text === 'string' ? body.reflection_text.trim() : null;
  const inputMode =
    typeof body.input_mode === 'string' && body.input_mode.trim()
      ? body.input_mode.trim()
      : 'manual';

  if (!Number.isInteger(userId) || userId <= 0) {
    errors.push('user_id is required and must be a positive integer.');
  }

  if (!moodLabel) {
    errors.push('mood_label is required.');
  }

  if (!Number.isInteger(moodScore) || moodScore < 1 || moodScore > 5) {
    errors.push('mood_score is required and must be between 1 and 5.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    value: {
      userId,
      moodLabel,
      moodScore,
      reflectionText,
      inputMode,
    },
  };
}

async function createMoodCheckin(req, res) {
  try {
    const validation = validateMoodCheckinPayload(req.body || {});

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors,
      });
    }

    // Store only the lightweight daily mood check-in for the new Component 4 flow.
    const created = await insertMoodCheckin(validation.value);

    return res.status(201).json({
      success: true,
      message: 'Mood check-in saved successfully',
      data: created,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to save mood check-in.',
      details: error.message,
    });
  }
}

module.exports = {
  createMoodCheckin,
};
