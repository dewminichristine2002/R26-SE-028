const positivePatterns = [
  /\b(happy|happier|glad|good|great|better|enjoy(?:ed)?|pleasant|comfort(?:ed|ing)?|supported|calm(?:er)?|relax(?:ed)?|connected|loved|smil(?:e|ed|ing))\b/i,
  /\b(helped|helpful|reassured|encouraged)\b/i,
];

const negativePatterns = [
  /\b(lonely|alone|sad|unhappy|worried|anxious|afraid|scared|angry|frustrated|upset|confused|foggy|forgot|forget|difficult|hard|worse|quiet|miss)\b/i,
  /\b(no one|nobody|cannot relax|can't relax|still feel|still felt)\b/i,
];

const neutralPatterns = [
  /\b(normal|usual|okay|fine|same as usual|nothing much|not sure|unclear)\b/i,
];

const concernEmotions = new Set(['sadness', 'loneliness', 'anxiety', 'anger', 'cognitive_fog']);

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function determineAnswerPolarity(answerText, { detectedEmotion = 'neutral' } = {}) {
  const text = String(answerText || '').trim();
  if (!text) {
    return 'unclear';
  }

  const hasPositiveEvidence = matchesAny(text, positivePatterns);
  const hasNegativeEvidence = matchesAny(text, negativePatterns);
  const hasContrastConcern = /\b(but|however|although|still|yet)\b/i.test(text) && hasNegativeEvidence;

  if (hasContrastConcern) {
    return 'negative';
  }
  if (/\b(not good|not great|not much energ(?:y|ized)|did not|didn't|haven't|have not)\b/i.test(text)) {
    return 'negative';
  }
  if (/^(no|nope|nah|not really|not today|nothing much|nothing special)\b/i.test(text)) {
    return hasPositiveEvidence && !hasNegativeEvidence ? 'positive' : 'negative';
  }
  if (/^(yes|yeah|yep|certainly|very much)\b/i.test(text)) {
    return hasNegativeEvidence ? 'negative' : 'positive';
  }
  if (hasPositiveEvidence && !hasNegativeEvidence) {
    return 'positive';
  }
  if (hasNegativeEvidence && !hasPositiveEvidence) {
    return 'negative';
  }
  if (hasPositiveEvidence && hasNegativeEvidence) {
    return concernEmotions.has(detectedEmotion) ? 'negative' : 'unclear';
  }
  if (detectedEmotion === 'happiness') {
    return 'positive';
  }
  if (concernEmotions.has(detectedEmotion)) {
    return 'negative';
  }
  if (matchesAny(text, neutralPatterns)) {
    return 'neutral';
  }

  return 'unclear';
}

module.exports = {
  determineAnswerPolarity,
};
