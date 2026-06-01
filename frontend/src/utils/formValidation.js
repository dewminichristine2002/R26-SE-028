const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;
const MEDICINE_NAME_RE = /[a-zA-Z]{2,}/;

export const isValidEmail = (value) => EMAIL_RE.test(String(value || '').trim());

export const isValidPhone = (value) => {
  const text = String(value || '').trim();
  if (!text) return true;
  return PHONE_RE.test(text);
};

export const parseAge = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const age = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(age) || age < 1 || age > 120) return null;
  return age;
};

export const validateProfileForm = (profile) => {
  const errors = {};
  const age = parseAge(profile?.age);
  if (age == null) errors.age = 'Enter a valid age between 1 and 120.';
  if (!String(profile?.gender || '').trim()) errors.gender = 'Please select a gender.';
  if (profile?.hasMedicineAllergy !== true && profile?.hasMedicineAllergy !== false) {
    errors.hasMedicineAllergy = 'Please answer whether you have medicine allergies.';
  }
  if (profile?.hasMedicineAllergy === true && !String(profile?.knownAllergiesText || '').trim()) {
    errors.knownAllergiesText = 'List known drug allergies or type “unsure”.';
  }
  const email = String(profile?.caregiverEmail || '').trim();
  if (email && !isValidEmail(email)) errors.caregiverEmail = 'Enter a valid caregiver email.';
  const phone = String(profile?.caregiverPhone || '').trim();
  if (phone && !isValidPhone(phone)) errors.caregiverPhone = 'Enter a valid phone number (7–20 digits).';
  return { valid: Object.keys(errors).length === 0, errors, message: Object.values(errors)[0] || '' };
};

export const validateOnboardingStep = (step, profile) => {
  const errors = {};
  if (step === 0) {
    if (parseAge(profile?.age) == null) errors.age = 'Enter a valid age between 1 and 120.';
    if (!String(profile?.gender || '').trim()) errors.gender = 'Please select a gender.';
  }
  if (step === 1) {
    if (profile?.hasMedicineAllergy !== true && profile?.hasMedicineAllergy !== false) {
      errors.hasMedicineAllergy = 'Please answer Yes or No for medicine allergies.';
    }
    if (profile?.hasMedicineAllergy === true && !String(profile?.knownAllergiesText || '').trim()) {
      errors.knownAllergiesText = 'List known drug allergies or type “unsure”.';
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, message: Object.values(errors)[0] || '' };
};

export const validateMedicineCheckForm = ({ medicineName, recentReaction, recentReactionDetail }) => {
  const errors = {};
  const name = String(medicineName || '').trim();
  if (name.length < 2) {
    errors.medicineName = 'Enter a medicine name (at least 2 characters).';
  } else if (!MEDICINE_NAME_RE.test(name)) {
    errors.medicineName = 'Medicine name should include letters (e.g. Paracetamol, Vitamin C).';
  }
  if (recentReaction === true && String(recentReactionDetail || '').trim().length < 3) {
    errors.recentReactionDetail = 'Describe the recent reaction (at least 3 characters).';
  }
  return { valid: Object.keys(errors).length === 0, errors, message: Object.values(errors)[0] || '' };
};

export const validateReactionForm = ({ symptoms, severity }) => {
  const errors = {};
  if (severity !== 'none' && String(symptoms || '').trim().length < 3) {
    errors.symptoms = 'Please describe the reaction (at least 3 characters).';
  }
  return { valid: Object.keys(errors).length === 0, errors, message: Object.values(errors)[0] || '' };
};

export const validateClinicalOverride = (justification) => {
  const text = String(justification || '').trim();
  if (text.length < 10) {
    return {
      valid: false,
      errors: { justification: 'Enter at least 10 characters documenting the clinical override.' },
      message: 'Enter at least 10 characters documenting the clinical override.',
    };
  }
  return { valid: true, errors: {}, message: '' };
};

export const profileComplete = (profile) => validateProfileForm(profile).valid;
