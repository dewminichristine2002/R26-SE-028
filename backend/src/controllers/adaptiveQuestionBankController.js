const {
  getAnyActiveQuestion,
  getOpeningQuestion,
  getQuestionByCode,
  getQuestionByTargetState,
} = require('../repositories/adaptiveQuestionBankRepository');

const targetStateKeywords = {
  loneliness: ['alone', 'lonely', 'miss', 'quiet', 'empty', 'isolated', 'no one'],
  sadness: ['sad', 'down', 'heavy', 'difficult', 'cry', 'teary', 'low'],
  anxiety: ['worried', 'anxious', 'nervous', 'stress', 'stressful', 'afraid'],
  happiness: ['happy', 'smile', 'good', 'joy', 'pleasant', 'glad', 'encouraged'],
  anger: ['angry', 'mad', 'frustrated', 'upset', 'annoyed', 'irritated'],
  cognitive_fog: ['foggy', 'confused', 'blank', 'unclear', 'mixed up'],
  memory: ['memory', 'remember', 'recall', 'forgot', 'forgotten', 'picture'],
  attention: ['focus', 'concentrate', 'distract', 'noise', 'attention'],
  executive_function: ['plan', 'organize', 'decision', 'decide', 'step', 'task'],
  mental_stimulation: ['read', 'puzzle', 'card', 'song', 'journal', 'learn', 'game'],
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function inferTargetState(previousAnswer, previousQuestion) {
  const answerText = normalizeText(previousAnswer);
  const previousTargetState = previousQuestion?.targetState || 'neutral';

  if (!answerText) {
    return previousTargetState;
  }

  const matchedState = Object.entries(targetStateKeywords).find(([, keywords]) =>
    keywords.some((keyword) => answerText.includes(keyword))
  );

  if (matchedState) {
    return matchedState[0];
  }

  return previousTargetState;
}

async function getNextAdaptiveQuestion(req, res) {
  try {
    const previousQuestionCode = normalizeText(req.query.previous_question_code);
    const previousAnswer = typeof req.query.previous_answer === 'string' ? req.query.previous_answer : '';
    const phase = normalizeText(req.query.phase);

    if (!previousQuestionCode || phase === 'opening') {
      const openingQuestion = await getOpeningQuestion();

      if (!openingQuestion) {
        return res.status(404).json({
          success: false,
          error: 'No active opening question was found.',
        });
      }

      return res.json({
        success: true,
        inferred_target_state: openingQuestion.targetState,
        question: openingQuestion,
      });
    }

    const previousQuestion = await getQuestionByCode(previousQuestionCode);

    if (!previousQuestion) {
      return res.status(404).json({
        success: false,
        error: 'Previous question was not found in the adaptive question bank.',
      });
    }

    const targetState = inferTargetState(previousAnswer, previousQuestion);
    let nextQuestion = await getQuestionByTargetState(targetState, previousQuestion.questionCode);

    if (!nextQuestion && targetState !== 'neutral') {
      nextQuestion = await getQuestionByTargetState('neutral', previousQuestion.questionCode);
    }

    if (!nextQuestion) {
      nextQuestion = await getAnyActiveQuestion('neutral');
    }

    if (!nextQuestion) {
      nextQuestion = await getOpeningQuestion();
    }

    if (!nextQuestion) {
      return res.status(404).json({
        success: false,
        error: 'No adaptive question could be selected.',
      });
    }

    return res.json({
      success: true,
      inferred_target_state: targetState,
      previous_question: previousQuestion,
      question: nextQuestion,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to select the next adaptive question.',
      details: error.message,
    });
  }
}

module.exports = {
  getNextAdaptiveQuestion,
};