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
  happy: ['happy', 'good', 'great', 'fine', 'better', 'grateful', 'calm'],
  sad: ['sad', 'down', 'cry', 'upset', 'hurt', 'empty', 'hopeless'],
  lonely: ['alone', 'lonely', 'isolated', 'nobody', 'miss someone', 'left out'],
  anxious: ['anxious', 'anxiety', 'worried', 'worry', 'stress', 'pressure', 'panic', 'afraid', 'nervous', 'overwhelmed'],
  confused: ['confused', 'confusion', 'forget', 'forgot', 'unclear', 'lost', 'do not understand', "don't understand"],
  angry: ['angry', 'anger', 'mad', 'furious', 'frustrated', 'annoyed', 'irritated'],
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

function inferEmotionFromText(text = '') {
  const normalized = normalizeText(text);
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

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] === 0 ? 'neutral' : ranked[0][0];
}

function inferEmotionFromEmoji(emoji) {
  return emojiEmotionMap[normalizeText(emoji)] || 'neutral';
}

module.exports = {
  inferEmotionFromEmoji,
  inferEmotionFromText,
  normalizeEmotion,
  normalizeText,
};
