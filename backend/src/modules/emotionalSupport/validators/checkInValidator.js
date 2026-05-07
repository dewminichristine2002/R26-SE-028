function validateCheckInPayload(body = {}) {
  const errors = [];

  if (!body.elderId) {
    errors.push('elderId is required');
  }

  if (!body.inputMode) {
    errors.push('inputMode is required');
  }

  if (!body.checkInType) {
    errors.push('checkInType is required');
  }

  if (!body.emoji && !body.text && !body.transcript) {
    errors.push('At least one emotional input is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateCheckInPayload,
};
