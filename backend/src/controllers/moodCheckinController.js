const { createMoodCheckin: insertMoodCheckin } = require('../repositories/moodCheckinRepository');
const { getProfileByElderId } = require('../repositories/profileRepository');
const { createAlertsForCaregivers } = require('../repositories/alertRepository');
const { evaluateAlertNeed } = require('../services/alertService');

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

    const created = await insertMoodCheckin(validation.value);
    const isNegativeMood =
      validation.value.moodScore <= 2 ||
      /\b(terrible|bad|sad|lonely|alone|anxious|angry|upset|down)\b/i.test(validation.value.moodLabel);
    let alertsCreated = 0;

    if (isNegativeMood) {
      const detectedEmotion = /\b(lonely|alone)\b/i.test(validation.value.moodLabel) ? 'lonely' : 'sad';
      const alertPayload = evaluateAlertNeed({
        elderId: validation.value.userId,
        caregiverId: null,
        detectedEmotion,
        riskLevel: validation.value.moodScore <= 1 ? 'high' : 'medium',
        negativeMoodCount7d: 0,
      });

      if (alertPayload) {
        const profile = await getProfileByElderId(validation.value.userId).catch(() => null);
        const createdAlerts = await createAlertsForCaregivers({
          elderId: validation.value.userId,
          caregiverIds: profile?.caregiverIds || [],
          sessionId: null,
          alertPayload,
          explanation: {
            source: 'mood_checkin',
            moodLabel: validation.value.moodLabel,
            moodScore: validation.value.moodScore,
            detectedEmotion,
            concernSummary: alertPayload.concernSummary || null,
          },
        });
        alertsCreated = createdAlerts.length;
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Mood check-in saved successfully',
      data: created,
      alertsCreated,
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
