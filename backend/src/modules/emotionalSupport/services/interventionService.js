const { getResponseTemplate } = require('../repositories/responseBankRepository');

const fallbackResponses = {
  happy: {
    id: null,
    responseType: 'motivation',
    responseText: 'It is good to hear some positive energy today. Let us build on that feeling.',
    followUpPrompt: 'Would you like a short gratitude reflection?',
  },
  neutral: {
    id: null,
    responseType: 'empathetic_reply',
    responseText: 'Thank you for checking in. Let us keep the day steady with one small mental activity.',
    followUpPrompt: 'Would you like to do a quick orientation check?',
  },
  sad: {
    id: null,
    responseType: 'empathetic_reply',
    responseText: 'It sounds like today feels difficult. We can slow down and focus on one gentle step together.',
    followUpPrompt: 'Would you like to reflect on one comforting memory?',
  },
  lonely: {
    id: null,
    responseType: 'empathetic_reply',
    responseText: 'Feeling alone can be heavy. You are being heard right now, and we can take one supportive step together.',
    followUpPrompt: 'Is there someone you would like to reach out to today?',
  },
  anxious: {
    id: null,
    responseType: 'calming_support',
    responseText: 'It sounds like you may be feeling worried. Let us slow the moment down and focus on one simple, familiar memory.',
    followUpPrompt: 'Would you like to remember a place where you have felt calm before?',
  },
  confused: {
    id: null,
    responseType: 'empathetic_reply',
    responseText: 'Feeling unsure can be unsettling. We can take this one step at a time and use a familiar memory to help you feel oriented.',
    followUpPrompt: 'Would you like to recall one familiar person, place, or routine?',
  },
  angry: {
    id: null,
    responseType: 'de_escalation',
    responseText: 'I can sense strong frustration right now. Let us pause and choose one steady memory before doing anything else.',
    followUpPrompt: 'Would you like to think of a time when someone helped you feel respected or understood?',
  },
};

async function selectIntervention({ detectedEmotion, riskLevel }) {
  const responseTemplate =
    (await getResponseTemplate({ detectedEmotion, riskLevel })) ||
    fallbackResponses[detectedEmotion] ||
    fallbackResponses.neutral;

  return {
    intervention: {
      responseBankId: responseTemplate.id || null,
      responseType: responseTemplate.responseType,
      responseText: responseTemplate.responseText,
      responseSource: responseTemplate.id ? 'response_bank' : 'template',
      reasoning: {
        triggerEmotion: detectedEmotion,
        triggerRiskLevel: riskLevel,
        selectedBecause: [
          'emotion-aligned support',
          responseTemplate.id ? 'response-bank match' : 'fallback support template',
        ],
      },
      followUpPrompt: responseTemplate.followUpPrompt || null,
    },
  };
}

module.exports = {
  selectIntervention,
};
