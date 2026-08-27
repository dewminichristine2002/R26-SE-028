async function getNextAdaptiveQuestion(req, res) {
  return res.status(410).json({
    success: false,
    deprecated: true,
    error: 'This stateless selector is deprecated. Use /adaptive-chat/start and /adaptive-chat/respond.',
  });
}

module.exports = {
  getNextAdaptiveQuestion,
};
