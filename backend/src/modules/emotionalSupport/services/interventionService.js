const activityCatalog = {
  happy: {
    title: 'Gratitude Reflection',
    type: 'reflection',
    prompt: 'What is one thing that made you smile today?',
  },
  neutral: {
    title: 'Orientation Check',
    type: 'orientation',
    prompt: 'What day is it today, and what is one thing you plan to do next?',
  },
  sad: {
    title: 'Memory Reflection',
    type: 'reflection',
    prompt: 'Share one pleasant memory from this week.',
  },
  lonely: {
    title: 'Connection Prompt',
    type: 'reflection',
    prompt: 'Name one person you would like to speak with and one thing you would tell them.',
  },
  stressed: {
    title: 'Breathing Pause',
    type: 'breathing',
    prompt: 'Breathe in for 4 seconds, hold for 2, and breathe out for 6.',
  },
};

const responseCatalog = {
  happy: {
    responseType: 'motivation',
    responseText: 'It is good to hear some positive energy today. Let us build on that feeling.',
  },
  neutral: {
    responseType: 'empathetic_reply',
    responseText: 'Thank you for checking in. Let us keep the day steady with one small mental activity.',
  },
  sad: {
    responseType: 'empathetic_reply',
    responseText: 'It sounds like today feels difficult. We can slow down and focus on one gentle step together.',
  },
  lonely: {
    responseType: 'empathetic_reply',
    responseText: 'Feeling alone can be heavy. You are being heard right now, and we can take one supportive step together.',
  },
  stressed: {
    responseType: 'calming_support',
    responseText: 'You seem under pressure right now. Let us pause first and reduce the tension with a short calming exercise.',
  },
};

function selectIntervention({ detectedEmotion, riskLevel }) {
  const baseResponse = responseCatalog[detectedEmotion] || responseCatalog.neutral;
  const activity = activityCatalog[detectedEmotion] || activityCatalog.neutral;

  return {
    intervention: {
      ...baseResponse,
      responseSource: 'template',
      reasoning: {
        triggerEmotion: detectedEmotion,
        triggerRiskLevel: riskLevel,
        selectedBecause: [
          'emotion-aligned support',
          'elder-friendly low-friction intervention',
        ],
      },
    },
    activity,
  };
}

module.exports = {
  selectIntervention,
};
