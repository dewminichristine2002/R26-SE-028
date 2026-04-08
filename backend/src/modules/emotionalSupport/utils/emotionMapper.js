const emojiEmotionMap = {
  happy: 'happy',
  smile: 'happy',
  neutral: 'neutral',
  sad: 'sad',
  lonely: 'lonely',
  stressed: 'stressed',
};

const emotionKeywords = {
  happy: ['happy', 'good', 'great', 'fine', 'better', 'grateful', 'calm'],
  sad: ['sad', 'down', 'cry', 'upset', 'hurt', 'empty', 'hopeless'],
  lonely: ['alone', 'lonely', 'isolated', 'nobody', 'miss someone', 'left out'],
  stressed: ['stress', 'worried', 'tired', 'pressure', 'panic', 'anxious', 'overwhelmed'],
};

function normalizeText(text = '') {
  return text.trim().toLowerCase();
}

function inferEmotionFromText(text = '') {
  const normalized = normalizeText(text);
  const scores = {
    happy: 0,
    neutral: 0,
    sad: 0,
    lonely: 0,
    stressed: 0,
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
  normalizeText,
};
