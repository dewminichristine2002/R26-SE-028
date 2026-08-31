const EMOTION_PATTERNS = Object.freeze({
  anger: String.raw`angry|mad|frustrated|upset`,
  sadness: String.raw`sad|down|unhappy`,
  loneliness: String.raw`lonely|alone|isolated`,
  anxiety: String.raw`anxious|worried|nervous`,
  happiness: String.raw`happy|glad|cheerful`,
  cognitive_fog: String.raw`foggy|unable to concentrate|can't concentrate|cannot concentrate`,
});

const FIRST_PERSON_PREFIX = String.raw`(?:i\s+(?:also\s+)?(?:am|was|feel|felt)|i['’]m(?:\s+feeling)?|i['’]ve\s+been(?:\s+feeling)?|my\s+thoughts\s+feel)`;
const NEGATION = String.raw`(?:not\s+|never\s+|no\s+longer\s+|don['’]t\s+feel\s+|do\s+not\s+feel\s+|wasn['’]t\s+|was\s+not\s+)?`;

function findExplicitEmotionEvidence(answerText) {
  const text = String(answerText || '').trim().toLowerCase();
  const mentions = [];

  Object.entries(EMOTION_PATTERNS).forEach(([emotion, emotionPattern]) => {
    const pattern = new RegExp(`\\b${FIRST_PERSON_PREFIX}\\s+(?<negation>${NEGATION})(?:really\\s+|very\\s+|a\\s+little\\s+)?(?<term>${emotionPattern})\\b`, 'giu');
    for (const match of text.matchAll(pattern)) {
      mentions.push({
        emotion,
        term: match.groups.term,
        negated: Boolean(match.groups.negation?.trim()),
        index: match.index,
        phrase: match[0],
      });
    }

    const additionalNegation = new RegExp(
      `\\b(?:i\\s+(?:don['’]t|do\\s+not)\\s+feel|i\\s+(?:wasn['’]t|am\\s+not|was\\s+not)|i['’]m\\s+not|i\\s+am\\s+no\\s+longer)\\s+(?:feeling\\s+)?(?:really\\s+|very\\s+)?(?<term>${emotionPattern})\\b`,
      'giu'
    );
    for (const match of text.matchAll(additionalNegation)) {
      if (!mentions.some((mention) => mention.index === match.index && mention.emotion === emotion)) {
        mentions.push({ emotion, term: match.groups.term, negated: true, index: match.index, phrase: match[0] });
      }
    }
  });

  // Conservative self-directed forms that do not use "I feel/am".
  const selfDirected = [
    { emotion: 'anger', pattern: /\b(?:what happened|that|this)\s+(?:really\s+)?upset\s+me\b/giu },
    { emotion: 'cognitive_fog', pattern: /\bmy\s+thoughts\s+(?:feel|are)\s+foggy\b/giu },
    { emotion: 'cognitive_fog', pattern: /\bi\s+(?:can't|cannot)\s+concentrate\b/giu },
  ];
  selfDirected.forEach(({ emotion, pattern }) => {
    for (const match of text.matchAll(pattern)) {
      mentions.push({ emotion, term: match[0], negated: false, index: match.index, phrase: match[0] });
    }
  });

  mentions.sort((a, b) => a.index - b.index);
  const affirmed = mentions.filter((mention) => !mention.negated);
  const primary = affirmed.at(-1) || null;
  const secondary = affirmed.filter((mention) => mention !== primary).map((mention) => mention.emotion);

  return {
    explicitEmotionDetected: Boolean(primary),
    explicitEmotion: primary?.emotion || null,
    primary,
    secondaryEmotions: [...new Set(secondary)],
    negatedEmotions: [...new Set(mentions.filter((mention) => mention.negated).map((mention) => mention.emotion))],
    mentions,
  };
}

module.exports = { EMOTION_PATTERNS, findExplicitEmotionEvidence };
