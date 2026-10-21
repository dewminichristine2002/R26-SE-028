const crypto = require('crypto');

const DEFAULT_SALT = 'eldermeds-feedback-anonymization-v1';

const hashUserId = (userId, salt = process.env.FEEDBACK_ANONYMIZATION_SALT || DEFAULT_SALT) =>
  crypto.createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 16);

const binAge = (ageText) => {
  const age = Number.parseInt(String(ageText || '').replace(/\D/g, ''), 10);
  if (!Number.isFinite(age) || age <= 0) {
    return 'unknown';
  }
  if (age < 65) {
    return 'under_65';
  }
  if (age < 75) {
    return '65_74';
  }
  if (age < 85) {
    return '75_84';
  }
  return '85_plus';
};

const stripPiiText = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]');
};

const encodeFeedbackNotes = (plainNotes, metadata = {}) => ({
  v: 1,
  notes: stripPiiText(plainNotes),
  recordType: metadata.recordType || 'reaction',
  pharmacistConfirmed: Boolean(metadata.pharmacistConfirmed),
  pharmacistRole: metadata.pharmacistRole || '',
  medicineCheckId: metadata.medicineCheckId ?? null,
  allergyCardId: metadata.allergyCardId ?? null,
  consentForTraining: metadata.consentForTraining !== false,
  justification: metadata.justification ? stripPiiText(metadata.justification).slice(0, 500) : '',
});

const decodeFeedbackNotes = (notesRaw) => {
  if (!notesRaw) {
    return { v: 0, notes: '', recordType: 'reaction', pharmacistConfirmed: false };
  }

  try {
    const parsed = JSON.parse(notesRaw);
    if (parsed && parsed.v === 1) {
      return parsed;
    }
  } catch {
    // plain text legacy notes
  }

  return {
    v: 0,
    notes: String(notesRaw),
    recordType: 'reaction',
    pharmacistConfirmed: false,
  };
};

const serializeFeedbackNotes = (plainNotes, metadata = {}) => JSON.stringify(encodeFeedbackNotes(plainNotes, metadata));

const anonymizeReactionRow = (row, { salt } = {}) => {
  const meta = decodeFeedbackNotes(row.notes);
  return {
    anonymizedUserId: hashUserId(row.user_id, salt),
    medicineCheckId: row.medicine_check_id,
    symptomsCategory: stripPiiText(row.symptoms).slice(0, 200),
    severity: row.severity,
    recordType: meta.recordType || 'reaction',
    pharmacistConfirmed: Boolean(meta.pharmacistConfirmed),
    createdAt: row.created_at,
    freeTextNotes: stripPiiText(meta.notes || '').slice(0, 300),
  };
};

const anonymizeTrainingRow = (row, { salt } = {}) => ({
  anonymizedUserId: hashUserId(row.user_id, salt),
  medicineCheckId: row.medicine_check_id,
  inputMethod: row.input_method,
  normalizedDrugName: row.normalized_drug_name,
  rxnormCui: row.rxnorm_cui,
  ingredientName: row.ingredient_name,
  therapeuticClass: row.therapeutic_class,
  riskScore: row.risk_score,
  riskLevel: row.risk_level,
  sideEffectCount: row.side_effect_count,
  severeSideEffectCount: row.severe_side_effect_count,
  sideEffectMatchCount: row.side_effect_match_count,
  interactionCount: row.interaction_count,
  maxInteractionSeverity: row.max_interaction_severity,
  ageBin: binAge(row.age),
  gender: row.gender || 'unknown',
  hasMedicineAllergy: row.has_medicine_allergy,
  reactionCount: row.reaction_count,
  hasReactionLog: row.has_reaction_log,
  hasSevereReactionLog: row.has_severe_reaction_log,
  medicineCheckCreatedAt: row.medicine_check_created_at,
});

module.exports = {
  hashUserId,
  binAge,
  stripPiiText,
  encodeFeedbackNotes,
  decodeFeedbackNotes,
  serializeFeedbackNotes,
  anonymizeReactionRow,
  anonymizeTrainingRow,
};
