const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;
const MEDICINE_NAME_RE = /[a-zA-Z]{2,}/;

const isValidEmail = (value) => EMAIL_RE.test(String(value || '').trim());

const isValidPhone = (value) => {
  const text = String(value || '').trim();
  if (!text) return true;
  return PHONE_RE.test(text);
};

const parseAge = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const age = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(age) || age < 1 || age > 120) return null;
  return age;
};

const buildResult = (errors) => ({
  valid: Object.keys(errors).length === 0,
  errors,
  message: Object.values(errors)[0] || '',
});

const validateProfileBody = (body) => {
  const errors = {};
  if (parseAge(body?.age) == null) errors.age = 'age must be between 1 and 120';
  if (!String(body?.gender || '').trim()) errors.gender = 'gender is required';
  if (body?.hasMedicineAllergy !== true && body?.hasMedicineAllergy !== false) {
    errors.hasMedicineAllergy = 'hasMedicineAllergy must be true or false';
  }
  if (body?.hasMedicineAllergy === true && !String(body?.knownAllergiesText || '').trim()) {
    errors.knownAllergiesText = 'knownAllergiesText is required when hasMedicineAllergy is true';
  }
  const email = String(body?.caregiverEmail || '').trim();
  if (email && !isValidEmail(email)) errors.caregiverEmail = 'caregiverEmail must be valid';
  const phone = String(body?.caregiverPhone || '').trim();
  if (phone && !isValidPhone(phone)) errors.caregiverPhone = 'caregiverPhone must be valid';
  return buildResult(errors);
};

const validateAnalysisBody = (body) => {
  const errors = {};
  const name = String(body?.medicineName || '').trim();
  if (name.length < 2) {
    errors.medicineName = 'medicineName must be at least 2 characters';
  } else if (!MEDICINE_NAME_RE.test(name)) {
    errors.medicineName = 'medicineName must include letters';
  }
  if (body?.hadReactionBefore === true && String(body?.symptomMatch || '').trim().length < 3) {
    errors.symptomMatch = 'symptomMatch is required when hadReactionBefore is true';
  }
  return buildResult(errors);
};

const validateReactionBody = (body) => {
  const errors = {};
  const severity = String(body?.severity || 'mild').toLowerCase();
  if (severity !== 'none' && String(body?.symptoms || '').trim().length < 3) {
    errors.symptoms = 'symptoms must be at least 3 characters when severity is not none';
  }
  return buildResult(errors);
};

const validationErrorResponse = (result) => ({
  error: result.message,
  fields: result.errors,
});

module.exports = {
  validateProfileBody,
  validateAnalysisBody,
  validateReactionBody,
  validationErrorResponse,
};
