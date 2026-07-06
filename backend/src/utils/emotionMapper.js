const emojiEmotionMap = {
  happy: 'happy',
  smile: 'happy',
  neutral: 'neutral',
  sad: 'sad',
  lonely: 'lonely',
  anxious: 'anxious',
  stressed: 'anxious',
  worried: 'anxious',
  confused: 'confused',
  angry: 'angry',
  anger: 'angry',
  frustrated: 'angry',
};

const emotionKeywords = {
  happy: [
    'happy',
    'good',
    'great',
    'fine',
    'better',
    'grateful',
    'thankful',
    'peaceful',
    'calm',
    'relaxed',
    'smile',
    'enjoyed',
    'laughed',
    'nice day',
    'feeling well',
    'felt good',
    'had a good',
  ],
  sad: [
    'sad',
    'down',
    'low',
    'cry',
    'crying',
    'tears',
    'upset',
    'hurt',
    'empty',
    'hopeless',
    'heavy heart',
    'heart feels heavy',
    'not happy',
    'not good',
    'not feeling good',
    'not feel good',
    'not okay',
    'not ok',
    'not fine',
    'not well',
    'not better',
    'no joy',
    'feel bad',
    'feeling bad',
    'feeling not good',
    'bad today',
    'very bad',
    'nothing feels good',
    'miss my',
    'missing my',
    'missed my',
  ],
  lonely: [
    'alone',
    'lonely',
    'isolated',
    'nobody',
    'no one',
    'no-one',
    'left out',
    'miss someone',
    'miss my daughter',
    'miss my son',
    'miss my family',
    'miss my wife',
    'miss my husband',
    'miss talking',
    'no one visited',
    'nobody visited',
    'no visitors',
    'not spoken with family',
    'not spoken with friends',
    'not spoken with family, friends',
    'did not talk to anyone',
    "didn't talk to anyone",
    'haven\'t spoken',
    'have not spoken',
    'socially disconnected',
    'thinking about my son',
    'thinking about my daughter',
    'thinking about family',
    'thinking about my wife',
    'thinking about my husband',
    'may miss family',
    'want connection with family',
    'wish someone was here',
  ],
  anxious: [
    'anxious',
    'anxiety',
    'worried',
    'worry',
    'worrying',
    'stress',
    'stressed',
    'pressure',
    'panic',
    'afraid',
    'scared',
    'fear',
    'fearful',
    'nervous',
    'overwhelmed',
    'restless',
    'uneasy',
    'cannot sleep',
    "can't sleep",
    'what if',
    'concerned',
    'tablet',
    'medicine',
    'forget my tablets',
    'miss my medicine',
  ],
  confused: [
    'confused',
    'confusion',
    'forget',
    'forgot',
    'forgotten',
    'unclear',
    'lost',
    'not sure',
    'unsure',
    'do not remember',
    "don't remember",
    'cannot remember',
    "can't remember",
    'do not understand',
    "don't understand",
    "don't know",
    'do not know',
    'which day',
    'what day',
    'where am i',
    'already ate',
    'already took',
  ],
  angry: [
    'angry',
    'anger',
    'mad',
    'furious',
    'frustrated',
    'annoyed',
    'irritated',
    'upset with',
    'shouted',
    'yelled',
    'unfair',
    'not listened',
    'ignored me',
    'they ignored',
    'made me angry',
    'cannot stand',
    "can't stand",
  ],
  neutral: [
    'normal',
    'usual',
    'same as usual',
    'okay',
    'ok',
    'not bad',
    'nothing special',
    'regular day',
    'ordinary',
    'steady',
  ],
};

const strongPhrases = {
  happy: ['feeling well', 'felt good', 'happy today', 'had a good', 'nice day'],
  sad: [
    'heavy heart',
    'heart feels heavy',
    'nothing feels good',
    'not happy',
    'not good',
    'not feeling good',
    'not feel good',
    'not okay',
    'not ok',
    'not fine',
    'not well',
    'not better',
    'feeling not good',
    'feel bad',
    'feeling bad',
    'bad today',
    'very bad',
    'hopeless',
  ],
  lonely: [
    'miss my daughter',
    'miss my son',
    'miss my family',
    'no one visited',
    'nobody visited',
    'did not talk to anyone',
    "didn't talk to anyone",
    'socially disconnected',
    'may miss family',
    'wish someone was here',
  ],
  anxious: ['cannot sleep', "can't sleep", 'panic', 'afraid', 'scared', 'forget my tablets', 'miss my medicine'],
  confused: ['do not remember', "don't remember", 'cannot remember', "can't remember", 'where am i', 'what day'],
  angry: ['made me angry', 'ignored me', 'not listened', 'cannot stand', "can't stand"],
};

const negatedPositivePhrases = ['not happy', 'not good', 'no joy', 'nothing good'];

const explicitEmotionPhrases = {
  lonely: [
    'i am alone',
    'i feel alone',
    'i feel lonely',
    'nobody visited',
    'no one visited',
    'i miss my',
  ],
  sad: [
    'not good',
    'not feeling good',
    'not feel good',
    'not okay',
    'not ok',
    'not fine',
    'not well',
    'not better',
    'i feel bad',
    'feeling bad',
    'bad today',
    'very bad',
    'i am sad',
    'i feel sad',
  ],
  anxious: [
    'i am worried',
    'i feel worried',
    'i am anxious',
    'i feel anxious',
    'i am scared',
    'i feel scared',
    'i cannot sleep',
    "i can't sleep",
  ],
  confused: [
    'i am confused',
    'i feel confused',
    'i forgot',
    'i cannot remember',
    "i can't remember",
    'i do not remember',
    "i don't remember",
    'not sure',
  ],
  angry: [
    'i am angry',
    'i feel angry',
    'i am mad',
    'i feel mad',
    'i am frustrated',
    'i feel frustrated',
  ],
  happy: [
    'i am happy',
    'i feel happy',
    'feeling good',
    'i feel good',
    'i am good',
  ],
};

const legacyEmotionMap = {
  stressed: 'anxious',
  stress: 'anxious',
  anger: 'angry',
};

function normalizeText(text = '') {
  return text.trim().toLowerCase();
}

function normalizeEmotion(emotion = 'neutral') {
  const normalized = normalizeText(emotion);
  return legacyEmotionMap[normalized] || normalized || 'neutral';
}

function getExplicitEmotionSignal(text = '') {
  const normalized = normalizeText(text);
  const rankedSignals = ['lonely', 'sad', 'anxious', 'confused', 'angry', 'happy'];

  if (!normalized || normalized.includes('not bad')) {
    return null;
  }

  return rankedSignals.find((emotion) =>
    explicitEmotionPhrases[emotion].some((phrase) => normalized.includes(phrase))
  ) || null;
}

function inferEmotionFromText(text = '') {
  const normalized = normalizeText(text);
  const explicitSignal = getExplicitEmotionSignal(normalized);
  const scores = {
    happy: 0,
    neutral: 0,
    sad: 0,
    lonely: 0,
    anxious: 0,
    confused: 0,
    angry: 0,
  };

  Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
    keywords.forEach((keyword) => {
      if (normalized.includes(keyword)) {
        scores[emotion] += 1;
      }
    });
  });

  Object.entries(strongPhrases).forEach(([emotion, phrases]) => {
    phrases.forEach((phrase) => {
      if (normalized.includes(phrase)) {
        scores[emotion] += 2;
      }
    });
  });

  if (explicitSignal) {
    scores[explicitSignal] += 4;
  }

  negatedPositivePhrases.forEach((phrase) => {
    if (normalized.includes(phrase)) {
      scores.happy = Math.max(0, scores.happy - 2);
    }
  });

  const ranked = Object.entries(scores).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }

    const priority = {
      lonely: 0,
      sad: 1,
      anxious: 2,
      confused: 3,
      angry: 4,
      happy: 5,
      neutral: 6,
    };

    return priority[a[0]] - priority[b[0]];
  });
  return ranked[0][1] === 0 ? 'neutral' : ranked[0][0];
}

function inferEmotionFromEmoji(emoji) {
  return emojiEmotionMap[normalizeText(emoji)] || 'neutral';
}

module.exports = {
  inferEmotionFromEmoji,
  inferEmotionFromText,
  getExplicitEmotionSignal,
  normalizeEmotion,
  normalizeText,
};
