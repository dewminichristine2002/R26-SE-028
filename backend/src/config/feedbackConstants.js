/** Phase 9 — reaction logging & continuous learning constants */

const REACTION_OUTCOMES = Object.freeze(['none', 'mild', 'moderate', 'severe', 'anaphylactic']);

const FEEDBACK_RECORD_TYPES = Object.freeze({
  REACTION: 'reaction',
  CLINICAL_OVERRIDE: 'clinical_override',
});

const PSI_DRIFT_THRESHOLD = 0.2;
const ACCURACY_DROP_THRESHOLD = 0.02;
const QUARTERLY_RETRAIN_DAYS = 90;

const normalizeReactionOutcome = (value) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return REACTION_OUTCOMES.includes(normalized) ? normalized : null;
};

module.exports = {
  REACTION_OUTCOMES,
  FEEDBACK_RECORD_TYPES,
  PSI_DRIFT_THRESHOLD,
  ACCURACY_DROP_THRESHOLD,
  QUARTERLY_RETRAIN_DAYS,
  normalizeReactionOutcome,
};
