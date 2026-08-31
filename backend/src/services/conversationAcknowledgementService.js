/**
 * Deterministic conversation acknowledgement layer.
 *
 * Turns each adaptive answer into a micro-conversation by returning one short,
 * predefined acknowledgement after every answer.
 *
 * Design rules:
 * - Receives ONLY safe signals: answer polarity, interpreted emotional
 *   direction, whether evidence was explicit or vague, question dimension,
 *   turn number and the previous acknowledgement text.
 * - Returns a SHORT predefined acknowledgement from a curated bank.
 * - No LLM is involved. Selection is fully deterministic.
 * - Never diagnoses, never promises, never claims to understand exactly how
 *   the elder feels, and never states medical conclusions.
 */

const ACKNOWLEDGEMENT_BANK = Object.freeze({
  neutral: Object.freeze([
    'Thanks for sharing.',
    'Thank you for telling me.',
    'Got it.',
  ]),
  positive: Object.freeze([
    'That sounds like a nice moment.',
    "I'm glad something felt positive today.",
    'Thanks for sharing that good moment.',
  ]),
  concern: Object.freeze([
    'Thank you for sharing that.',
    'I appreciate you telling me.',
    'That sounds like it was a difficult moment.',
  ]),
});

// Emotional states that map to the concern-oriented bank even when the raw
// answer polarity is unclear or neutral.
const CONCERN_STATES = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);

const POSITIVE_STATES = new Set(['happiness']);

function normalizePolarity(value) {
  const polarity = String(value || '').trim().toLowerCase();
  return ['positive', 'negative', 'neutral', 'unclear'].includes(polarity) ? polarity : 'unclear';
}

/**
 * Choose the acknowledgement category using only safe signals.
 *
 * Priority:
 * 1. Explicit positive polarity -> positive bank.
 * 2. Concern-oriented emotional direction (or explicit negative polarity)
 *    -> concern bank.
 * 3. Everything else (neutral / vague answers) -> simple neutral bank.
 */
function resolveCategory({ answerPolarity, detectedState } = {}) {
  const polarity = normalizePolarity(answerPolarity);
  const state = String(detectedState || 'neutral').trim().toLowerCase();

  if (polarity === 'positive' && !CONCERN_STATES.has(state)) {
    return 'positive';
  }
  if (POSITIVE_STATES.has(state) && polarity !== 'negative') {
    return 'positive';
  }
  if (polarity === 'negative' || CONCERN_STATES.has(state)) {
    return 'concern';
  }
  return 'neutral';
}

/**
 * Deterministically pick an acknowledgement that differs from the immediately
 * previous one so the elder never hears the same phrase twice in a row.
 *
 * Selection uses only turn number + category + previous acknowledgement, so
 * the same input always produces the same output.
 */
function selectFromBank(category, { turnNumber = 1, previousAcknowledgement = null } = {}) {
  const bank = ACKNOWLEDGEMENT_BANK[category] || ACKNOWLEDGEMENT_BANK.neutral;
  const candidates = bank.filter((text) => text !== previousAcknowledgement);
  const pool = candidates.length ? candidates : bank;
  const index = Math.max(0, Number(turnNumber) || 1) % pool.length;
  return pool[index];
}

/**
 * Build the acknowledgement for one adaptive turn.
 *
 * @param {object} safeSignals
 * @param {string} safeSignals.answerPolarity       positive | negative | neutral | unclear
 * @param {string} safeSignals.detectedState        interpreted emotional direction of this turn
 * @param {boolean} [safeSignals.isExplicit]        whether emotion evidence was explicit (reserved;
 *                                                  vague answers simply fall back to the neutral bank)
 * @param {string} [safeSignals.questionDimension]  assessment dimension of the asked question
 * @param {number} [safeSignals.turnNumber]         1-based turn number within the session
 * @param {string|null} [safeSignals.previousAcknowledgement] acknowledgement shown after the previous turn
 * @returns {{ category: string, message: string }}
 */
function buildAcknowledgement(safeSignals = {}) {
  const category = resolveCategory(safeSignals);
  const message = selectFromBank(category, {
    turnNumber: safeSignals.turnNumber,
    previousAcknowledgement: safeSignals.previousAcknowledgement,
  });
  return { category, message };
}

module.exports = {
  ACKNOWLEDGEMENT_BANK,
  CONCERN_STATES,
  buildAcknowledgement,
  resolveCategory,
};