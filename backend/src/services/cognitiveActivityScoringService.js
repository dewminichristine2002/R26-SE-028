function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[.,!?;:'"]/g, '');
}

function canonicalOption(item, value) {
  const wanted = normalize(value);
  const match = (item.options || []).find((entry) => {
    const option = typeof entry === 'string' ? { id: entry, label: entry } : entry;
    return normalize(option.id) === wanted || normalize(option.label) === wanted;
  });
  return match ? normalize(typeof match === 'string' ? match : match.id) : null;
}

function scoreItem(item, response) {
  if (!item || !['single_choice', 'multi_recall', 'ordering'].includes(item.kind)) throw new Error('This activity does not contain a supported objective task.');
  if (item.kind === 'single_choice') {
    const answer = canonicalOption(item, response?.selectedAnswer);
    if (!answer) throw new Error('A valid answer option is required.');
    const isCorrect = answer === normalize(item.correctAnswer);
    return { score: isCorrect ? 1 : 0, isCorrect, response: { selectedAnswer: answer, responseTimeMs: Math.max(0, Number(response?.responseTimeMs) || 0) } };
  }
  if (item.kind === 'ordering') {
    if (!Array.isArray(response?.orderedAnswers)) throw new Error('Ordered answers must be an array.');
    const ordered = response.orderedAnswers.map((answer) => canonicalOption(item, answer));
    if (ordered.length !== item.options.length || ordered.some((answer) => !answer) || new Set(ordered).size !== ordered.length) throw new Error('A complete valid ordering is required.');
    const isCorrect = ordered.every((answer, index) => answer === normalize(item.correctOrder[index]));
    return { score: isCorrect ? 1 : 0, isCorrect, response: { orderedAnswers: ordered, responseTimeMs: Math.max(0, Number(response?.responseTimeMs) || 0) } };
  }
  if (!Array.isArray(response?.selectedAnswers)) throw new Error('Selected answers must be an array.');
  const selected = [...new Set(response.selectedAnswers.map((answer) => canonicalOption(item, answer)))];
  if (!selected.length || selected.some((answer) => !answer)) throw new Error('One or more recall answers are invalid.');
  const correct = new Set(item.correctAnswers.map(normalize));
  const correctSelections = selected.filter((answer) => correct.has(answer)).length;
  const incorrectSelections = selected.filter((answer) => !correct.has(answer)).length;
  const score = Math.max(0, Math.min(1, (correctSelections - incorrectSelections) / correct.size));
  return { score, isCorrect: score === 1, response: { selectedAnswers: selected, responseTimeMs: Math.max(0, Number(response?.responseTimeMs) || 0) } };
}

function scoreObjectiveResponse(task, response) {
  if (Array.isArray(task?.items)) {
    if (!Array.isArray(response?.itemResponses) || response.itemResponses.length !== task.items.length) throw new Error(`Responses for all ${task.items.length} items are required.`);
    const byId = new Map(response.itemResponses.map((itemResponse) => [String(itemResponse.itemId), itemResponse]));
    const results = task.items.map((item) => {
      const itemResponse = byId.get(String(item.id));
      if (!itemResponse) throw new Error(`A response for item ${item.id} is required.`);
      return { itemId: item.id, ...scoreItem(item, itemResponse) };
    });
    const accuracy = results.reduce((sum, result) => sum + result.score, 0) / results.length;
    return {
      accuracy: Number(accuracy.toFixed(4)), isCorrect: results.every((result) => result.isCorrect),
      normalizedResponse: { itemResponses: results.map(({ itemId, response: itemResponse }) => ({ itemId, ...itemResponse })) },
    };
  }
  if (!task || !['single_choice', 'multi_recall'].includes(task.kind)) throw new Error('This activity does not contain a supported objective task.');
  if (task.kind === 'single_choice') {
    const result = scoreItem(task, response);
    return { accuracy: result.score, isCorrect: result.isCorrect, normalizedResponse: result.response };
  }
  const result = scoreItem(task, response);
  return { accuracy: Number(result.score.toFixed(4)), isCorrect: result.isCorrect, normalizedResponse: result.response };
}

module.exports = { scoreItem, scoreObjectiveResponse };
