function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function scoreObjectiveResponse(task, response) {
  if (!task || !['single_choice', 'multi_recall'].includes(task.kind)) throw new Error('This activity does not contain a supported objective task.');
  if (task.kind === 'single_choice') {
    const answer = normalize(response?.selectedAnswer);
    if (!answer || !task.options.map(normalize).includes(answer)) throw new Error('A valid answer option is required.');
    const isCorrect = answer === normalize(task.correctAnswer);
    return { accuracy: isCorrect ? 1 : 0, isCorrect, normalizedResponse: { selectedAnswer: response.selectedAnswer } };
  }
  if (!Array.isArray(response?.selectedAnswers)) throw new Error('Selected answers must be an array.');
  const allowed = new Set(task.options.map(normalize));
  const selected = [...new Set(response.selectedAnswers.map(normalize))];
  if (!selected.length || selected.some((answer) => !allowed.has(answer))) throw new Error('One or more recall answers are invalid.');
  const correct = new Set(task.correctAnswers.map(normalize));
  const correctSelections = selected.filter((answer) => correct.has(answer)).length;
  const incorrectSelections = selected.filter((answer) => !correct.has(answer)).length;
  const accuracy = Math.max(0, (correctSelections - incorrectSelections) / correct.size);
  return { accuracy: Number(accuracy.toFixed(4)), isCorrect: accuracy === 1, normalizedResponse: { selectedAnswers: response.selectedAnswers } };
}

module.exports = { scoreObjectiveResponse };
