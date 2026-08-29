const SUPPORTED = new Set(['happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral']);
const CONCERNS = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);

function normalizeEmotion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED.has(normalized) ? normalized : 'neutral';
}

function isShortContextDependentAnswer(answer) {
  const text = String(answer || '').trim().toLowerCase();
  const words = text.match(/[a-z']+/g) || [];
  return words.length <= 4 || /^(yes|yeah|yep|no|nope|not really|not today|sometimes|a little|nothing much)[.! ]*$/.test(text);
}

function defaultSemanticEffect(question, polarity) {
  const dimension = question?.assessmentDimension;
  if (polarity === 'positive' && ['general_wellbeing', 'energy_motivation', 'daily_engagement'].includes(dimension)) {
    return 'supports:happiness';
  }
  if (polarity === 'negative' && ['general_wellbeing', 'energy_motivation', 'daily_engagement'].includes(dimension)) {
    return 'supports:sadness';
  }
  if (dimension === 'social_connection' && question?.targetState === 'loneliness') {
    return polarity === 'negative' ? 'supports:loneliness' : polarity === 'positive' ? 'opposes:loneliness' : null;
  }
  return null;
}

function effectFor(question, polarity) {
  const key = `${polarity}ResponseEffect`;
  return question?.[key] || defaultSemanticEffect(question, polarity);
}

function emotionFromEffect(effect, previousEmotion = 'neutral') {
  if (!effect) return null;
  if (effect.startsWith('supports:')) return normalizeEmotion(effect.slice('supports:'.length));
  if (effect.startsWith('opposes:')) return previousEmotion === effect.slice('opposes:'.length) ? 'neutral' : previousEmotion;
  if (effect === 'preserve_previous') return normalizeEmotion(previousEmotion);
  return null;
}

function interpretContextualAnswer({
  question,
  answerText,
  answerPolarity,
  rawMlEmotion,
  rawMlConfidence,
  rawDetectionSource,
  fallbackEmotion = 'neutral',
  previousInterpretedEmotion = 'neutral',
  confidenceThreshold = 0.3,
}) {
  const rawEmotion = normalizeEmotion(rawMlEmotion);
  const confidence = Number.isFinite(Number(rawMlConfidence)) ? Number(rawMlConfidence) : null;
  const shortAnswer = isShortContextDependentAnswer(answerText);
  const effect = effectFor(question, answerPolarity);
  const contextualEmotion = emotionFromEffect(effect, normalizeEmotion(previousInterpretedEmotion));
  const confidentMeaningfulMl = rawDetectionSource === 'ml_model' && confidence >= confidenceThreshold && rawEmotion !== 'neutral' && !shortAnswer;

  let interpretedEmotion = 'neutral';
  let evidenceSource = 'no_usable_evidence';
  let reason = 'No meaningful ML, deterministic, or question-context evidence was available.';

  if (confidentMeaningfulMl) {
    interpretedEmotion = rawEmotion;
    evidenceSource = 'raw_ml_retained';
    reason = 'Confident non-neutral ML evidence from a meaningful free-text answer was retained.';
  } else if (contextualEmotion && ['positive', 'negative', 'neutral'].includes(answerPolarity)) {
    interpretedEmotion = contextualEmotion;
    evidenceSource = 'question_context';
    reason = `Curated ${answerPolarity} response semantics (${effect}) supplied context for a short, neutral, or low-confidence answer.`;
  } else if (rawDetectionSource === 'rule_fallback' && normalizeEmotion(fallbackEmotion) !== 'neutral') {
    interpretedEmotion = normalizeEmotion(fallbackEmotion);
    evidenceSource = 'rule_fallback_retained';
    reason = 'Strong deterministic linguistic fallback evidence was retained.';
  } else if (rawDetectionSource === 'ml_model' && confidence >= confidenceThreshold && rawEmotion !== 'neutral') {
    interpretedEmotion = rawEmotion;
    evidenceSource = 'raw_ml_retained';
    reason = 'Non-neutral ML evidence was retained because no contradictory curated context was available.';
  } else if (rawEmotion === 'neutral') {
    interpretedEmotion = 'neutral';
    evidenceSource = 'raw_neutral';
    reason = 'The answer and question context remained neutral or ambiguous.';
  }

  return {
    interpretedEmotion,
    evidenceSource,
    reason,
    rawMlEmotion: rawEmotion,
    rawMlConfidence: confidence,
    rawDetectionSource,
    fallbackEmotion: rawDetectionSource === 'rule_fallback' ? normalizeEmotion(fallbackEmotion) : null,
    answerPolarity,
    questionTargetState: normalizeEmotion(question?.targetState),
    assessmentDimension: question?.assessmentDimension || null,
    semanticEffect: effect,
    shortContextDependentAnswer: shortAnswer,
    contextualEvidenceWeight: evidenceSource === 'question_context' ? 0.65 : null,
  };
}

module.exports = {
  CONCERNS,
  effectFor,
  interpretContextualAnswer,
  isShortContextDependentAnswer,
};
