const SUPPORTED = new Set(['happiness', 'sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog', 'neutral']);
const CONCERNS = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);
const { findExplicitEmotionEvidence } = require('./explicitEmotionEvidenceService');

function normalizeEmotion(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED.has(normalized) ? normalized : 'neutral';
}

function classifyShortAnswer(answerText) {
  const text = String(answerText || '').trim().toLowerCase().replace(/[’]/g, "'").replace(/[.!?]+$/, '').trim();
  if (/^(?:yes|yeah|yep|sure|certainly|very much|quite a bit)$/.test(text)) return 'affirmative';
  if (/^(?:no|nope|nah|not really|not today|not at all)$/.test(text)) return 'negative';
  if (/^(?:sometimes|a little|a bit|i think so|i think so[, ]+.*|maybe|perhaps)$/.test(text)) return 'tentative';
  if (/^(?:not anymore|no longer|i'm fine|i am fine|i don't know|i do not know|unsure|i'm okay|i am okay)$/.test(text)) return 'ambiguous';
  return null;
}

function isShortContextDependentAnswer(answer) {
  const text = String(answer || '').trim();
  const words = text.match(/[a-z']+/gi) || [];
  return words.length <= 4 || classifyShortAnswer(text) !== null;
}

function directQuestionTarget(question) {
  const text = String(question?.questionText || '').toLowerCase();
  const target = normalizeEmotion(question?.targetState);
  if (!CONCERNS.has(target)) return null;
  const patterns = {
    sadness: /\b(?:sad|down|unhappy|low|blue|hopeless)\b/,
    loneliness: /\b(?:lonely|alone|isolated|left out|disconnected)\b/,
    anxiety: /\b(?:worried|worry|anxious|nervous|uneasy|afraid|scared|stressed)\b/,
    anger: /\b(?:angry|anger|mad|frustrated|annoyed|irritated)\b/,
    cognitive_fog: /\b(?:confused|foggy|concentrat\w*|focus\w*|remember\w*|lose track)\b/,
  };
  return patterns[target].test(text) ? target : null;
}

function defaultSemanticEffect(question, polarity) {
  const dimension = question?.assessmentDimension;
  if (polarity === 'positive' && ['general_wellbeing', 'energy_motivation', 'daily_engagement'].includes(dimension)) return 'supports:happiness';
  if (polarity === 'negative' && ['general_wellbeing', 'energy_motivation', 'daily_engagement'].includes(dimension)) return 'supports:sadness';
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
  question, answerText, answerPolarity, rawMlEmotion, rawMlConfidence, rawDetectionSource,
  fallbackEmotion = 'neutral', previousInterpretedEmotion = 'neutral', previousAnswers = [], confidenceThreshold = 0.3,
}) {
  const rawEmotion = normalizeEmotion(rawMlEmotion);
  const confidence = Number.isFinite(Number(rawMlConfidence)) ? Number(rawMlConfidence) : null;
  const shortAnswer = isShortContextDependentAnswer(answerText);
  const responseKind = classifyShortAnswer(answerText);
  const directTarget = directQuestionTarget(question);
  const effectPolarity = responseKind === 'affirmative' ? 'positive' : responseKind === 'negative' ? 'negative' : answerPolarity;
  const effect = effectFor(question, effectPolarity);
  const contextualEmotion = emotionFromEffect(effect, normalizeEmotion(previousInterpretedEmotion));
  const normalizedAnswer = String(answerText || '').replace(/[’]/g, "'").replace(/\bI'm\b/gi, 'I am').replace(/\bwasn't\b/gi, 'was not').replace(/\bdon't\b/gi, 'do not');
  const explicitEvidence = findExplicitEmotionEvidence(answerText);
  if (explicitEvidence.explicitEmotionDetected && explicitEvidence.negatedEmotions.length > 0) explicitEvidence.hasNegatedMention = true;
  const topicalEmotion = /\b(?:worried|worry|anxious|nervous|uneasy|afraid|scared|stressed)\b/i.test(String(answerText || '')) ? 'anxiety' : null;
  const explicitlyNegatedRawEmotion = explicitEvidence.negatedEmotions.includes(rawEmotion);
  const confidentMeaningfulMl = rawDetectionSource === 'ml_model' && confidence >= confidenceThreshold && rawEmotion !== 'neutral' && !shortAnswer;
  const hasResolution = /\b(?:not anymore|no longer|do not feel .* anymore|now (?:i feel|i am))\b/i.test(normalizedAnswer);
  const uncertainPhrase = responseKind === 'tentative' || responseKind === 'ambiguous';
  const clarificationSuggested = Boolean(explicitEvidence.conflictingCurrentEmotions || uncertainPhrase || /\bsometimes\b/i.test(String(answerText || '')) || (shortAnswer && !directTarget));
  let interpretedEmotion = 'neutral';
  let evidenceSource = 'no_usable_evidence';
  let reason = 'No meaningful ML, deterministic, or question-context evidence was available.';

  if (explicitEvidence.conflictingCurrentEmotions) {
    evidenceSource = 'conflicting_explicit_self_report';
    reason = 'The answer contains multiple different current emotional self-reports; clarification is needed.';
  } else if (explicitEvidence.explicitEmotionDetected) {
    interpretedEmotion = explicitEvidence.explicitEmotion;
    evidenceSource = 'explicit_self_report';
    reason = 'A current, non-negated first-person emotional self-report supplied direct linguistic evidence.';
  } else if (explicitEvidence.negatedEmotions.length > 0) {
    evidenceSource = 'explicit_emotion_negated';
    reason = 'The first-person statement explicitly negated an emotion; that class was not retained as supporting evidence.';
  } else if (/\b(?:yes|yeah|yep)\b[,. ]+(?:very\s+)?(?:worried|anxious|nervous)\b/i.test(normalizedAnswer) && directTarget === 'anxiety') {
    interpretedEmotion = 'anxiety';
    evidenceSource = 'direct_question_affirmation';
    reason = 'An affirmative answer with matching worry language supports queried anxiety.';
  } else if (responseKind === 'affirmative' && directTarget && topicalEmotion === directTarget) {
    interpretedEmotion = directTarget;
    evidenceSource = 'direct_question_affirmation';
    reason = `An affirmative answer and matching current concern language support queried ${directTarget}.`;
  } else if (hasResolution) {
    evidenceSource = 'resolved_or_uncertain_current_state';
    reason = 'The answer indicates the queried feeling has ended or its current status is unclear.';
  } else if (/\bi\s+(?:am|feel|felt|have been feeling)\s+(?:feeling\s+)?(?:good|great|better|well|cheerful|joyful|content)\b/i.test(normalizedAnswer)) {
    interpretedEmotion = 'happiness';
    evidenceSource = 'explicit_self_report';
    reason = 'A narrowly matched first-person positive wellbeing statement supplied direct linguistic evidence.';
  } else if (/\b(?:no visitors|no one to talk to|nobody to talk to|left out|isolated|miss(?:ing)? my (?:family|daughter|son|wife|husband|friend|friends))\b/i.test(normalizedAnswer)) {
    interpretedEmotion = 'loneliness';
    evidenceSource = 'explicit_self_report';
    reason = 'A narrowly matched social disconnection statement supplied direct linguistic evidence.';
  } else if (/\b(?:struggling to stay focused|hard to stay focused|difficulty concentrating)\b/i.test(normalizedAnswer)) {
    interpretedEmotion = 'cognitive_fog';
    evidenceSource = 'explicit_self_report';
    reason = 'A narrowly matched concentration difficulty statement supplied direct linguistic evidence.';
  } else if (explicitlyNegatedRawEmotion) {
    evidenceSource = 'explicit_emotion_negated';
    reason = `The first-person statement explicitly negated ${rawEmotion}; that class was not retained as supporting evidence.`;
  } else if (responseKind === 'affirmative' && directTarget) {
    interpretedEmotion = directTarget;
    evidenceSource = 'direct_question_affirmation';
    reason = `A clear affirmative answer to a question explicitly asking about ${directTarget} supports that queried state.`;
  } else if (responseKind === 'negative' && directTarget) {
    evidenceSource = 'direct_question_negation';
    reason = `A clear negative answer rejects the queried ${directTarget} state and does not establish its opposite.`;
  } else if (responseKind === 'tentative' && /^i think so(?:[.!?])?$/i.test(String(answerText || '').trim())) {
    evidenceSource = 'uncertain_answer';
    reason = 'The answer expresses uncertainty and needs clarification before assigning an emotion.';
  } else if (responseKind === 'tentative' && directTarget) {
    interpretedEmotion = directTarget;
    evidenceSource = 'tentative_question_context';
    reason = `A tentative answer provides weak evidence for queried ${directTarget}; follow-up clarification is suggested.`;
  } else if (uncertainPhrase) {
    evidenceSource = 'uncertain_answer';
    reason = 'The answer is tentative or ambiguous and does not support a definite emotion label.';
  } else if (confidentMeaningfulMl) {
    interpretedEmotion = rawEmotion;
    evidenceSource = 'raw_ml_retained';
    reason = 'Confident non-neutral ML evidence from a meaningful free-text answer was retained.';
  } else if (!uncertainPhrase && contextualEmotion && ['positive', 'negative', 'neutral'].includes(effectPolarity)) {
    interpretedEmotion = contextualEmotion;
    evidenceSource = 'question_context';
    reason = `Curated ${effectPolarity} response semantics (${effect}) supplied context for a short, neutral, or low-confidence answer.`;
  } else if (rawDetectionSource === 'rule_fallback' && normalizeEmotion(fallbackEmotion) !== 'neutral' && !explicitEvidence.negatedEmotions.includes(normalizeEmotion(fallbackEmotion))) {
    interpretedEmotion = normalizeEmotion(fallbackEmotion);
    evidenceSource = 'rule_fallback_retained';
    reason = 'Strong deterministic linguistic fallback evidence was retained.';
  } else if (rawDetectionSource === 'ml_model' && confidence >= confidenceThreshold && rawEmotion !== 'neutral' && !explicitEvidence.negatedEmotions.includes(rawEmotion)) {
    interpretedEmotion = rawEmotion;
    evidenceSource = 'raw_ml_retained';
    reason = 'Non-neutral ML evidence was retained because no contradictory curated context was available.';
  } else if (rawEmotion === 'neutral') {
    evidenceSource = 'raw_neutral';
    reason = 'The answer and question context remained neutral or ambiguous.';
  }

  const contextualWeight = evidenceSource === 'tentative_question_context' ? 0.35 : evidenceSource === 'direct_question_affirmation' ? 0.65 : evidenceSource === 'question_context' ? 0.65 : null;
  return {
    interpretedEmotion, evidenceSource, reason, rawMlEmotion: rawEmotion, rawMlConfidence: confidence,
    rawDetectionSource, fallbackEmotion: rawDetectionSource === 'rule_fallback' ? normalizeEmotion(fallbackEmotion) : null,
    answerPolarity, questionTargetState: normalizeEmotion(question?.targetState), assessmentDimension: question?.assessmentDimension || null,
    semanticEffect: effect, shortContextDependentAnswer: shortAnswer,
    contextualEvidenceWeight: contextualWeight,
    explicitEvidenceWeight: evidenceSource === 'explicit_self_report' ? 1 : null,
    evidenceStrength: evidenceSource === 'explicit_self_report' ? 'explicit_self_report'
      : evidenceSource === 'raw_ml_retained' ? 'strong_ml'
        : evidenceSource === 'direct_question_affirmation' ? 'contextual_supported'
          : evidenceSource === 'tentative_question_context' ? 'weak_contextual'
            : evidenceSource === 'question_context' ? (shortAnswer ? 'weak_contextual' : 'contextual_supported')
              : evidenceSource === 'rule_fallback_retained' ? 'fallback' : 'ambiguous',
    explicitEmotion: explicitEvidence.explicitEmotion,
    explicitEmotionDetected: explicitEvidence.explicitEmotionDetected,
    secondaryExplicitEmotions: explicitEvidence.secondaryEmotions,
    negatedExplicitEmotions: explicitEvidence.negatedEmotions,
    explicitEmotionMentions: explicitEvidence.mentions,
    conflictingExplicitEmotions: explicitEvidence.conflictingCurrentEmotions,
    clarificationSuggested, uncertaintyReason: clarificationSuggested ? reason : null,
    responseKind, directQuestionTarget: directTarget,
    priorTurnCount: Array.isArray(previousAnswers) ? previousAnswers.length : 0,
  };
}

module.exports = { CONCERNS, effectFor, interpretContextualAnswer, isShortContextDependentAnswer };
