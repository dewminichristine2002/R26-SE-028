const EMOTION_PATTERNS = Object.freeze({
  anger: String.raw`angry|mad|frustrated|upset|annoyed|irritated|furious|resentful|fed\s+up`,
  sadness: String.raw`sad|down|unhappy|low|blue|empty|hopeless|tearful|gloomy`,
  loneliness: String.raw`lonely|alone|isolated|left\s+out|socially\s+disconnected|disconnected`,
  anxiety: String.raw`anxious|worried|nervous|uneasy|stressed|on\s+edge|afraid|scared|overwhelmed|panicky`,
  happiness: String.raw`happy|happier|glad|cheerful|joyful|content|delighted|pleased|grateful|joy`,
  cognitive_fog: String.raw`confused|foggy|unclear|unable\s+to\s+concentrate|(?:can['â€™]?t|cannot)\s+(?:concentrate|focus|remember)|lose\s+track|losing\s+track`,
});

const PREFIX = String.raw`(?:i\s+(?:(?:am|was|feel|felt|have\s+been|had\s+been)(?:\s+feeling)?|used\s+to\s+(?:feel|be))|i['’](?:m(?:\s+feeling)?|ve\s+been(?:\s+feeling)?))\s+`;
const NEGATION = String.raw`(?<negation>not\s+|never\s+|no\s+longer\s+|don['’]t\s+feel\s+|do\s+not\s+feel\s+|wasn['’]t\s+|was\s+not\s+|am\s+not\s+)?`;
const INTENSITY = String.raw`(?:really\s+|very\s+|a\s+little\s+|somewhat\s+)?`;
const ADDITIONAL_SELF_PATTERNS = Object.freeze([
  ['sadness', /\bi\s+have\s+felt\s+empty\b/giu],
  ['anger', /\bi\s+do\s+not\s+feel\s+(?:angry|mad|frustrated)\b/giu],
  ['sadness', /\bi\s+do\s+not\s+feel\s+(?:sad|down|unhappy)\b/giu],
  ['loneliness', /\bi\s+(?:am\s+not|was\s+not)\s+(?:feeling\s+)?(?:lonely|alone)\b/giu],
  ['anxiety', /\bi\s+(?:am\s+not|was\s+not)\s+(?:feeling\s+)?(?:worried|anxious|nervous)\b/giu],
  ['happiness', /\bi\s+(?:am\s+not|was\s+not)\s+(?:feeling\s+)?happy\b/giu],
  ['cognitive_fog', /\bi\s+(?:can\s*'t|cannot)\s+(?:concentrate|focus|remember)\b/giu],
  ['cognitive_fog', /\bi\s+feel\s+mentally\s+foggy\b/giu],
  ['cognitive_fog', /\bmy\s+thinking\s+feels\s+foggy\b/giu],
]);
const SELF_DIRECTED = Object.freeze([
  ['happiness', /\bi\s+(?:really\s+)?(?:enjoyed|enjoy|loved)\b/giu],
  ['happiness', /\bi\s+(?:had|spent)\s+(?:a\s+)?(?:good|great|lovely|wonderful)\b/giu],
  ['sadness', /\bmy\s+heart\s+(?:feels|felt|is)\s+heavy\b/giu],
  ['loneliness', /\bi\s+miss\s+(?:talking\s+with\s+)?my\s+(?:family|daughter|son|wife|husband|friend|friends)\b/giu],
  ['loneliness', /\bi\s+wish\s+(?:someone|somebody)\s+were\s+here\b/giu],
  ['loneliness', /\bi\s+(?:have|had)\s+no\s+one\s+to\s+talk\s+to\b/giu],
  ['loneliness', /\b(?:i\s+(?:have|had)\s+)?no\s+visitors\b/giu],
  ['anxiety', /\bi\s+(?:can['â€™]t|cannot)\s+relax\b/giu],
  ['anxiety', /\bi\s+(?:am|feel)\s+on\s+edge\b/giu],
  ['anger', /\bi\s+am\s+fed\s+up\b/giu],
  ['cognitive_fog', /\bi\s+(?:keep\s+)?(?:lose|losing)\s+track\s+of\s+what\s+i['â€™]?m\s+doing\b/giu],
  ['cognitive_fog', /\bi\s+keep\s+forgetting\s+what\s+i\s+(?:was\s+)?doing\b/giu],
  ['cognitive_fog', /\bi\s+(?:have\s+trouble\s+(?:focusing|concentrating)|am\s+struggling\s+to\s+stay\s+focused)\b/giu],
  ['cognitive_fog', /\bi\s+find\s+it\s+hard\s+to\s+follow\s+conversations\b/giu],
  ['cognitive_fog', /\bmy\s+(?:thinking|thoughts)\s+(?:feel|felt|are)\s+(?:foggy|unclear)\b/giu],
]);
const SUPPLEMENTAL_SELF_DIRECTED = Object.freeze([
  ['cognitive_fog', /\bi\s+lose\s+track\s+of\s+what\s+i\s+am\s+doing\b/giu],
]);
const CONJUNCTIVE_EMOTION = Object.freeze([
  ['anger', String.raw`angry|mad|frustrated|upset|annoyed|irritated|furious|resentful`],
  ['sadness', String.raw`sad|down|unhappy|low|blue|empty|hopeless|tearful|gloomy`],
  ['loneliness', String.raw`lonely|alone|isolated|left\s+out|disconnected`],
  ['anxiety', String.raw`anxious|worried|nervous|uneasy|stressed|afraid|scared|overwhelmed|panicky`],
  ['happiness', String.raw`happy|glad|cheerful|joyful|content|delighted|pleased|grateful`],
  ['cognitive_fog', String.raw`confused|foggy|unclear`],
]);

function clauseBefore(text, index) {
  const boundary = Math.max(text.lastIndexOf(' but ', index), text.lastIndexOf(' however ', index), text.lastIndexOf(';', index));
  return text.slice(boundary + 1, index);
}

function isHistoricalMention(text, index) {
  const clause = clauseBefore(text, index);
  if (/\bused\s+to\b/i.test(text.slice(index, index + 16))) return true;
  if (/\bi\s+was\b/i.test(text.slice(0, index)) && !/\b(?:now|today|currently)\b/i.test(clause)) return true;
  if (/\b(?:now|today|currently|at\s+present)\b/i.test(clause)) return false;
  return /\b(?:used\s+to|previously|in\s+the\s+past|earlier|yesterday|last\s+(?:week|month|year)|before)\b/i.test(clause);
}

function findExplicitEmotionEvidence(answerText) {
  const text = String(answerText || '').trim().toLowerCase().replace(/[’]/g, "'").replace(/\bi'm\b/g, 'i am').replace(/\bi've\b/g, 'i have').replace(/\bwasn't\b/g, 'was not').replace(/\bdon't\b/g, 'do not');
  const mentions = [];

  Object.entries(EMOTION_PATTERNS).forEach(([emotion, emotionPattern]) => {
    const pattern = new RegExp(String.raw`\b${PREFIX}${NEGATION}${INTENSITY}(?<term>${emotionPattern})\b`, 'giu');
    for (const match of text.matchAll(pattern)) {
      mentions.push({
        emotion,
        term: match.groups.term,
        negated: Boolean(match.groups.negation?.trim()),
        historical: isHistoricalMention(text, match.index),
        index: match.index,
        phrase: match[0],
      });
    }
  });

  SELF_DIRECTED.forEach(([emotion, pattern]) => {
    for (const match of text.matchAll(pattern)) {
        mentions.push({ emotion, term: match[0], negated: /\b(?:not|was not|do not)\b/i.test(match[0]),
        historical: isHistoricalMention(text, match.index), index: match.index, phrase: match[0] });
    }
  });
  ADDITIONAL_SELF_PATTERNS.forEach(([emotion, pattern]) => {
    for (const match of text.matchAll(pattern)) {
      if (mentions.some((mention) => mention.index === match.index && mention.emotion === emotion)) continue;
      mentions.push({ emotion, term: match[0], negated: /\b(?:not|was not|do not)\b/i.test(match[0]),
        historical: isHistoricalMention(text, match.index), index: match.index, phrase: match[0] });
    }
  });
  SUPPLEMENTAL_SELF_DIRECTED.forEach(([emotion, pattern]) => {
    for (const match of text.matchAll(pattern)) {
      if (mentions.some((mention) => mention.index === match.index && mention.emotion === emotion)) continue;
      mentions.push({ emotion, term: match[0], negated: /\b(?:not|was not|do not)\b/i.test(match[0]),
        historical: isHistoricalMention(text, match.index), index: match.index, phrase: match[0] });
    }
  });

  CONJUNCTIVE_EMOTION.forEach(([emotion, terms]) => {
    const pattern = new RegExp(String.raw`\b(?:but|and|also)\s+(?:i\s+(?:also\s+)?(?:feel|am)\s+)?(?:a\s+little\s+|very\s+|really\s+)?(?<term>${terms})\b`, 'giu');
    for (const match of text.matchAll(pattern)) {
      mentions.push({ emotion, term: match.groups.term, negated: false,
        historical: isHistoricalMention(text, match.index), index: match.index, phrase: match[0] });
    }
  });

  mentions.sort((a, b) => a.index - b.index);
  const currentAffirmed = mentions.filter((mention) => !mention.negated && !mention.historical);
  const currentEmotionSet = [...new Set(currentAffirmed.map((mention) => mention.emotion))];
  const temporalResolution = /\b(?:was|used to)\b[\s\S]*,?\s+but\s+(?:now|today|currently)\b/i.test(text);
  const multipleDistinctCurrent = currentEmotionSet.length > 1 && /\b(?:and also|while|although)\b/i.test(text);
  const mixedConjunction = currentEmotionSet.length > 1 && /\bbut\b/i.test(text) && /\b(?:also|too)\b/i.test(text) && !temporalResolution
    && !/\bbut\s+i\s+also\s+(?:feel|am)\s+/i.test(text);
  const conflictingCurrentEmotions = multipleDistinctCurrent || mixedConjunction;
  const primary = conflictingCurrentEmotions ? null : (currentAffirmed.at(-1) || null);
  const negatedEmotions = [...new Set(mentions.filter((mention) => mention.negated).map((mention) => mention.emotion))];
  const historicalEmotions = [...new Set(mentions.filter((mention) => mention.historical).map((mention) => mention.emotion))];

  return {
    explicitEmotionDetected: Boolean(primary),
    explicitEmotion: primary?.emotion || null,
    primary,
    secondaryEmotions: [...new Set(currentAffirmed.filter((mention) => mention !== primary).map((mention) => mention.emotion))],
    negatedEmotions,
    historicalEmotions,
    conflictingCurrentEmotions,
    mentions,
  };
}

module.exports = { EMOTION_PATTERNS, findExplicitEmotionEvidence };
