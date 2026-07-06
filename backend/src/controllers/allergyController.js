const allergyModel = require('../models/allergyModel');
const {
  REACTION_OUTCOMES,
  FEEDBACK_RECORD_TYPES,
  normalizeReactionOutcome,
} = require('../config/feedbackConstants');
const {
  enrichMedication,
  resolveMedication,
} = require('../services/medicationKnowledgeService');
const { buildRiskReport } = require('../services/riskReportService');
const { predictMedicineRisk } = require('../services/mlPredictionService');
const {
  resolveDrugClass,
  getDrugClassTerms,
  extractDrugClassesFromText,
} = require('../services/drugClassLookupService');
const {
  blendHybridScore,
  classifyRiskLevel,
  HYBRID_RULE_WEIGHT,
  HYBRID_ML_WEIGHT,
  RISK_THRESHOLDS,
} = require('../config/hybridScoring');
const { buildPipelineReport } = require('../services/medicineInputPipeline');
const { CLINICAL_RULES, hasClassCrossReactivity } = require('../config/clinicalRules');
const {
  buildClinicalFactor,
  buildRuleAuditTrail,
  anonymizeUserIdForAudit,
  applyP1ShortCircuit,
  shouldBlockMlDowngrade,
  logClinicalRuleAudit,
  resolveMaxAllergySeverity,
  scoreAllergyCrossReactivityRule,
} = require('../services/clinicalRuleEngine');

const {
  validateProfileBody,
  validateAnalysisBody,
  validateReactionBody,
  validationErrorResponse,
} = require('../utils/formValidation');

const normalizeText = (value) => (value == null ? '' : String(value).trim());

const normalizeNullableBoolean = (value) => {
  if (value === true || value === false) {
    return value;
  }

  return null;
};

const sanitizeProfilePayload = (body) => ({
  age: normalizeText(body.age),
  gender: normalizeText(body.gender),
  hasMedicineAllergy: normalizeNullableBoolean(body.hasMedicineAllergy),
  knownAllergiesText: normalizeText(body.knownAllergiesText),
  chronicDiseasesText: normalizeText(body.chronicDiseasesText),
  currentMedicationsText: normalizeText(body.currentMedicationsText),
  emergencyContact: normalizeText(body.emergencyContact),
  caregiverDetails: normalizeText(body.caregiverDetails),
  caregiverEmail: normalizeText(body.caregiverEmail),
  caregiverPhone: normalizeText(body.caregiverPhone),
  profileCompleted: body.profileCompleted === true || body.profileCompleted === 'true',
  reactionSymptomsText: normalizeText(body.reactionSymptomsText),
  suspectedMedicineNamesText: normalizeText(body.suspectedMedicineNamesText),
  avoidedMedicinesText: normalizeText(body.avoidedMedicinesText),
  antibioticPainkillerReaction: normalizeText(body.antibioticPainkillerReaction),
  feedbackConsentForTraining: body.feedbackConsentForTraining === true || body.feedbackConsentForTraining === 'true',
});

const sanitizeQuestionnaireAnswers = (answers) => {
  if (!Array.isArray(answers)) {
    return null;
  }

  return answers
    .map((answer) => ({
      questionKey: normalizeText(answer?.questionKey),
      answerText: normalizeText(answer?.answerText),
    }))
    .filter((answer) => answer.questionKey);
};

const sanitizeRiskFactors = (riskFactors) => {
  if (!Array.isArray(riskFactors)) {
    return [];
  }

  return riskFactors
    .map((factor) => ({
      factorType: normalizeText(factor?.factorType),
      factorLabel: normalizeText(factor?.factorLabel),
      severity: normalizeText(factor?.severity),
      score: Number.isFinite(Number(factor?.score)) ? Number(factor.score) : 0,
    }))
    .filter((factor) => factor.factorLabel);
};

const sanitizeStringArray = (values) => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => normalizeText(value)).filter(Boolean);
};

const sanitizePlainObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

const sanitizeHistoryEntry = (historyEntry, fallbackPayload) => {
  if (!historyEntry) {
    return null;
  }

  return {
    inputMethod: normalizeText(historyEntry.inputMethod),
    rawInput: normalizeText(historyEntry.rawInput),
    medicineName: normalizeText(historyEntry.medicineName || fallbackPayload.medicineName),
    normalizedDrugName: normalizeText(historyEntry.normalizedDrugName || fallbackPayload.normalizedDrugName),
    rxnormCui: normalizeText(historyEntry.rxnormCui || fallbackPayload.rxnormCui),
    ingredientName: normalizeText(historyEntry.ingredientName || fallbackPayload.ingredientName),
    therapeuticClass: normalizeText(historyEntry.therapeuticClass || fallbackPayload.therapeuticClass),
    dose: normalizeText(historyEntry.dose),
    frequency: normalizeText(historyEntry.frequency),
    riskScore: Number.isFinite(Number(historyEntry.riskScore)) ? Number(historyEntry.riskScore) : fallbackPayload.riskScore,
    riskLevel: normalizeText(historyEntry.riskLevel || fallbackPayload.riskLevel),
    sideEffectCount: Number.isFinite(Number(historyEntry.sideEffectCount)) ? Number(historyEntry.sideEffectCount) : Number(fallbackPayload.sideEffectCount || 0),
    severeSideEffectCount: Number.isFinite(Number(historyEntry.severeSideEffectCount)) ? Number(historyEntry.severeSideEffectCount) : Number(fallbackPayload.severeSideEffectCount || 0),
    sideEffectMatchCount: Number.isFinite(Number(historyEntry.sideEffectMatchCount)) ? Number(historyEntry.sideEffectMatchCount) : Number(fallbackPayload.sideEffectMatchCount || 0),
    interactionCount: Number.isFinite(Number(historyEntry.interactionCount)) ? Number(historyEntry.interactionCount) : Number(fallbackPayload.interactionCount || 0),
    maxInteractionSeverity: normalizeText(historyEntry.maxInteractionSeverity || fallbackPayload.maxInteractionSeverity),
    knowledgeSources: Array.isArray(historyEntry.knowledgeSources)
      ? historyEntry.knowledgeSources
      : (Array.isArray(fallbackPayload.knowledgeSources) ? fallbackPayload.knowledgeSources : []),
  };
};

const sanitizeCardPayload = (body) => {
  const payload = {
    title: normalizeText(body.title),
    medicineName: normalizeText(body.medicineName),
    normalizedDrugName: normalizeText(body.normalizedDrugName),
    rxnormCui: normalizeText(body.rxnormCui),
    ingredientName: normalizeText(body.ingredientName),
    therapeuticClass: normalizeText(body.therapeuticClass),
    status: normalizeText(body.status) || 'draft',
    riskScore: Number.isFinite(Number(body.riskScore)) ? Number(body.riskScore) : null,
    riskLevel: normalizeText(body.riskLevel),
    sideEffectCount: Number.isFinite(Number(body.sideEffectCount)) ? Number(body.sideEffectCount) : 0,
    severeSideEffectCount: Number.isFinite(Number(body.severeSideEffectCount)) ? Number(body.severeSideEffectCount) : 0,
    sideEffectMatchCount: Number.isFinite(Number(body.sideEffectMatchCount)) ? Number(body.sideEffectMatchCount) : 0,
    interactionCount: Number.isFinite(Number(body.interactionCount)) ? Number(body.interactionCount) : 0,
    maxInteractionSeverity: normalizeText(body.maxInteractionSeverity),
    knowledgeSources: Array.isArray(body.knowledgeSources)
      ? body.knowledgeSources.map((value) => normalizeText(value)).filter(Boolean)
      : [],
    guidelines: sanitizeStringArray(body.guidelines),
    medicationKnowledge: sanitizePlainObject(body.medicationKnowledge),
    dataUsed: sanitizePlainObject(body.dataUsed),
    explanation: normalizeText(body.explanation),
    recommendation: normalizeText(body.recommendation),
    riskFactors: sanitizeRiskFactors(body.riskFactors),
  };

  payload.historyEntry = sanitizeHistoryEntry(body.historyEntry, payload);
  return payload;
};

const sanitizeReactionPayload = (body) => {
  const severity = normalizeReactionOutcome(body.severity) || normalizeReactionOutcome(body.outcome) || 'mild';

  return {
    medicineCheckId: Number.isFinite(Number(body.medicineCheckId)) ? Number(body.medicineCheckId) : null,
    allergyCardId: Number.isFinite(Number(body.allergyCardId)) ? Number(body.allergyCardId) : null,
    symptoms: normalizeText(body.symptoms),
    severity,
    notes: normalizeText(body.notes),
    pharmacistConfirmed: body.pharmacistConfirmed === true || body.pharmacistConfirmed === 'true',
    pharmacistRole: normalizeText(body.pharmacistRole) || (body.pharmacistConfirmed ? 'pharmacist' : ''),
    recordType: FEEDBACK_RECORD_TYPES.REACTION,
    consentForTraining: body.consentForTraining !== false,
  };
};

const sanitizeClinicalOverridePayload = (body) => ({
  medicineCheckId: Number.isFinite(Number(body.medicineCheckId)) ? Number(body.medicineCheckId) : null,
  allergyCardId: Number.isFinite(Number(body.allergyCardId)) ? Number(body.allergyCardId) : null,
  medicineName: normalizeText(body.medicineName),
  riskLevel: normalizeText(body.riskLevel) || 'Dangerous',
  justification: normalizeText(body.justification),
  notes: normalizeText(body.notes),
  pharmacistConfirmed: body.pharmacistConfirmed === true || body.pharmacistConfirmed === 'true',
  pharmacistRole: normalizeText(body.pharmacistRole) || '',
  consentForTraining: body.consentForTraining !== false,
});

const normalizeYesNo = (value) => {
  if (value === true || value === false) {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }

  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }

  return null;
};

const compareRiskLevel = (left, right) => {
  const weights = { Safe: 1, Warning: 2, Dangerous: 3 };
  return (weights[left] || 0) - (weights[right] || 0);
};

/**
 * Low/minor DDInter-only context: no allergy / dangerous combo / high-severity interaction.
 * Prevents "Dangerous" from stacking polypharmacy, age, and prior check scores alone (e.g. second-gen antihistamines).
 */
const isBenignLowSeverityOnlyInteractionContext = ({
  medicationKnowledge,
  riskFactors,
  hasDirectAllergyMatch,
  hasClassAllergyMatch,
  hasNsaidAspirinCross,
  hasDangerousCombination,
  hasHighInteraction,
}) => {
  if (hasDirectAllergyMatch || hasClassAllergyMatch || hasNsaidAspirinCross || hasDangerousCombination || hasHighInteraction) {
    return false;
  }
  const n = Number(medicationKnowledge?.interactionCount || 0);
  if (n <= 0) {
    return false;
  }
  if (String(medicationKnowledge?.maxInteractionSeverity || '').toLowerCase() !== 'low') {
    return false;
  }
  return !(riskFactors || []).some((f) => f.factorType === 'ddinter_interaction' && f.severity === 'high');
};

const isBenignLowSeverityOnlyInteractionAnalysis = (analysisPayload) =>
  isBenignLowSeverityOnlyInteractionContext({
    medicationKnowledge: analysisPayload?.medicationKnowledge,
    riskFactors: analysisPayload?.riskFactors,
    hasDirectAllergyMatch: (analysisPayload?.riskFactors || []).some((f) => f.factorType === 'allergy_match'),
    hasClassAllergyMatch: (analysisPayload?.riskFactors || []).some((f) => f.factorType === 'allergy_class_match'),
    hasNsaidAspirinCross: (analysisPayload?.riskFactors || []).some((f) => f.factorType === 'nsaid_aspirin_cross_allergy'),
    hasDangerousCombination: (analysisPayload?.riskFactors || []).some((f) => f.factorType === 'dangerous_combination'),
    hasHighInteraction: analysisPayload?.medicationKnowledge?.maxInteractionSeverity === 'high',
  });

const hasClinicallySpecificRuleEvidence = (analysisPayload) =>
  (analysisPayload?.riskFactors || []).some((factor) => {
    const factorType = normalizeText(factor?.factorType);
    const severity = normalizeText(factor?.severity);
    const score = Number(factor?.score || 0);

    if (!factorType || factorType === 'no_direct_penicillin_conflict') {
      return false;
    }

    return score >= 10 && (severity === 'high' || severity === 'medium');
  });

const weakEvidenceMlSafeCeiling = (ruleScore) => {
  const maxPreRoundBlend = RISK_THRESHOLDS.warningMin - 0.51;
  const mlCeiling = Math.floor((maxPreRoundBlend - HYBRID_RULE_WEIGHT * Number(ruleScore || 0)) / HYBRID_ML_WEIGHT);
  return Math.max(0, Math.min(100, mlCeiling));
};

const shouldLimitWeakEvidenceMlLift = ({ analysisPayload, ruleScore, rawMlScore, adrRiskProbability, youdenThreshold }) => {
  if (ruleScore >= 10 || rawMlScore <= 0) {
    return false;
  }

  if (!Number.isFinite(Number(adrRiskProbability)) || !Number.isFinite(Number(youdenThreshold))) {
    return false;
  }

  if (Number(adrRiskProbability) >= Number(youdenThreshold)) {
    return false;
  }

  if (hasClinicallySpecificRuleEvidence(analysisPayload)) {
    return false;
  }

  if (Number(analysisPayload?.medicationKnowledge?.interactionCount || 0) > 0) {
    return false;
  }

  if (Number(analysisPayload?.medicationKnowledge?.sideEffectMatchCount || 0) > 0) {
    return false;
  }

  if (Number(analysisPayload?.dataUsed?.historyDangerousCount || 0) > 0) {
    return false;
  }

  if (Number(analysisPayload?.dataUsed?.historyWarningCount || 0) > 0) {
    return false;
  }

  return true;
};

const includesAnyTerm = (haystack, terms = []) => {
  const normalizedHaystack = normalizeText(haystack).toLowerCase();
  if (!normalizedHaystack) {
    return false;
  }

  return terms.some((term) => {
    const normalizedTerm = normalizeText(term).toLowerCase();
    return normalizedTerm && normalizedHaystack.includes(normalizedTerm);
  });
};

const countListedItems = (value) =>
  String(value || '')
    .split(/[,/;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;

const ASPIRIN_SALICYLATE_ALLERGY_TERMS = [
  'aspirin',
  'acetylsalicylic',
  'salicylate',
  'asa',
  'disprin',
  'ecosprin',
  'bayer',
  'asasantin',
];

const FAMILY_TERM_MAP = [
  {
    match: ['amoxicillin', 'ampicillin', 'augmentin', 'penicillin', 'benzylpenicillin', 'phenoxymethylpenicillin'],
    terms: ['penicillin', 'penicillin antibiotic', 'beta-lactam', 'beta lactam'],
  },
  {
    match: ['sulfamethoxazole', 'sulfonamide', 'sulfa'],
    terms: ['sulfa', 'sulfonamide', 'sulfa drug', 'sulfa drugs'],
  },
  {
    match: ['ibuprofen', 'naproxen', 'diclofenac', 'ketorolac', 'aspirin', 'nsaid'],
    terms: ['nsaid', 'nonsteroidal anti-inflammatory', 'non steroidal anti inflammatory'],
  },
];

const getMedicationFlags = (...values) => {
  const combined = values.map((value) => normalizeText(value).toLowerCase()).join(' ');

  return {
    isNsaid: ['ibuprofen', 'naproxen', 'diclofenac', 'ketorolac', 'aspirin', 'nsaid'].some((term) => combined.includes(term)),
    isPenicillinFamily: ['amoxicillin', 'ampicillin', 'augmentin', 'penicillin', 'benzylpenicillin', 'phenoxymethylpenicillin'].some((term) => combined.includes(term)),
    isSulfaFamily: ['sulfamethoxazole', 'sulfonamide', 'sulfa'].some((term) => combined.includes(term)),
    isAnticoagulant: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'heparin', 'enoxaparin'].some((term) => combined.includes(term)),
    isAntiplatelet: ['aspirin', 'clopidogrel', 'ticagrelor', 'prasugrel'].some((term) => combined.includes(term)),
    isOpioidLike: ['tramadol', 'morphine', 'codeine', 'oxycodone', 'hydrocodone', 'fentanyl'].some((term) => combined.includes(term)),
    isAntibiotic: ['amoxicillin', 'ampicillin', 'azithromycin', 'ciprofloxacin', 'cephalexin', 'doxycycline', 'antibiotic'].some((term) => combined.includes(term)),
    isNtiDrug: ['warfarin', 'digoxin', 'lithium', 'phenytoin', 'theophylline', 'levothyroxine', 'methotrexate', 'cyclosporine'].some((term) =>
      combined.includes(term)
    ),
    isAntihypertensive: [
      'amlodipine',
      'nifedipine',
      'felodipine',
      'losartan',
      'valsartan',
      'olmesartan',
      'telmisartan',
      'irbesartan',
      'enalapril',
      'lisinopril',
      'ramipril',
      'captopril',
      'atenolol',
      'metoprolol',
      'bisoprolol',
      'carvedilol',
      'propranolol',
      'hydrochlorothiazide',
      'chlorthalidone',
      'furosemide',
      'spironolactone',
      'indapamide',
    ].some((term) => combined.includes(term)),
    isRenalExcretion: ['metformin', 'digoxin', 'lithium', 'atenolol', 'nitrofurantoin', 'allopurinol'].some((term) => combined.includes(term)),
    isHepaticMetabolism: ['warfarin', 'statins', 'atorvastatin', 'simvastatin', 'carbamazepine', 'phenytoin', 'paracetamol', 'acetaminophen'].some(
      (term) => combined.includes(term)
    ),
  };
};

const hasSevereReactionSignal = (payload, questionnaireText) => {
  const severity = normalizeText(payload?.severity).toLowerCase();
  const symptomText = `${normalizeText(payload?.symptomMatch)} ${normalizeText(payload?.notes)} ${normalizeText(questionnaireText)}`.toLowerCase();

  if (severity === 'severe') {
    return true;
  }

  return ['breathing trouble', 'shortness of breath', 'swelling', 'anaphylaxis', 'collapse'].some((term) =>
    symptomText.includes(term)
  );
};

const expandFamilyTerms = (...values) => {
  const combined = values.map((value) => normalizeText(value).toLowerCase()).join(' ');
  const extraTerms = new Set();

  FAMILY_TERM_MAP.forEach(({ match, terms }) => {
    if (match.some((token) => combined.includes(token))) {
      terms.forEach((term) => extraTerms.add(term));
    }
  });

  return Array.from(extraTerms);
};

const assessChronicContraindicationRisk = ({
  chronicDiseasesText,
  currentMedicationsText,
  therapeuticClass,
  ingredientName,
  medicineName,
}) => {
  const chronic = normalizeText(chronicDiseasesText).toLowerCase();
  const medicineText = [therapeuticClass, ingredientName, medicineName].map((value) => normalizeText(value).toLowerCase()).join(' ');
  const currentMeds = normalizeText(currentMedicationsText).toLowerCase();

  if (!chronic || !medicineText) {
    return {
      hasRisk: false,
      score: 0,
      label: '',
      hasAsthmaRisk: false,
      hasHypertensionRisk: false,
      hasCardioOrRenalRisk: false,
      hasAntihypertensiveUse: false,
    };
  }

  const flags = getMedicationFlags(therapeuticClass, ingredientName, medicineName);
  const currentMedicationFlags = getMedicationFlags(currentMedicationsText);
  const hasCardioOrRenalRisk = ['hypertension', 'kidney', 'renal', 'heart failure', 'cardiac', 'diabetes'].some((term) => chronic.includes(term));
  const hasHypertensionRisk = ['hypertension', 'high blood pressure'].some((term) => chronic.includes(term));
  const hasAsthmaRisk =
    ['asthma', 'wheeze', 'wheezing', 'bronchospasm'].some((term) => chronic.includes(term)) ||
    ['salbutamol', 'albuterol', 'ventolin', 'inhaler'].some((term) => currentMeds.includes(term));
  const hasAntihypertensiveUse = currentMedicationFlags.isAntihypertensive;
  const hasBleedingRisk = ['ulcer', 'bleeding', 'gastritis', 'stomach bleed'].some((term) => chronic.includes(term));

  if (flags.isNsaid && hasAsthmaRisk && hasHypertensionRisk) {
    return {
      hasRisk: true,
      score: 0,
      label: 'Asthma and hypertension plus NSAID class may worsen breathing symptoms and blood-pressure control.',
      hasAsthmaRisk,
      hasHypertensionRisk,
      hasCardioOrRenalRisk,
      hasAntihypertensiveUse,
    };
  }

  if (flags.isNsaid && hasAsthmaRisk) {
    return {
      hasRisk: true,
      score: 0,
      label: 'Asthma plus NSAID class may worsen breathing symptoms and should be reviewed carefully.',
      hasAsthmaRisk,
      hasHypertensionRisk,
      hasCardioOrRenalRisk,
      hasAntihypertensiveUse,
    };
  }

  if (flags.isNsaid && hasCardioOrRenalRisk) {
    return {
      hasRisk: true,
      score: 0,
      label: 'Hypertension/chronic condition plus NSAID class may increase medicine risk.',
      hasAsthmaRisk,
      hasHypertensionRisk,
      hasCardioOrRenalRisk,
      hasAntihypertensiveUse,
    };
  }

  if ((flags.isAnticoagulant || flags.isAntiplatelet) && hasBleedingRisk) {
    return {
      hasRisk: true,
      score: 10,
      label: 'Bleeding-prone chronic condition plus anticoagulant/antiplatelet medicine needs extra caution.',
      hasAsthmaRisk,
      hasHypertensionRisk,
      hasCardioOrRenalRisk,
      hasAntihypertensiveUse,
    };
  }

  return {
    hasRisk: false,
    score: 0,
    label: '',
    hasAsthmaRisk,
    hasHypertensionRisk,
    hasCardioOrRenalRisk,
    hasAntihypertensiveUse,
  };
};

const hasDangerousMedicationCombination = ({ medicineFlags, currentMedicationsText }) => {
  const currentText = normalizeText(currentMedicationsText).toLowerCase();
  const currentFlags = getMedicationFlags(currentText);
  const hasBenzodiazepineNow = ['diazepam', 'lorazepam', 'alprazolam', 'clonazepam', 'midazolam'].some((term) =>
    currentText.includes(term)
  );

  // Typical high-caution combinations for elderly safety triage.
  if ((medicineFlags.isAnticoagulant && currentFlags.isNsaid) || (medicineFlags.isNsaid && currentFlags.isAnticoagulant)) {
    return true;
  }
  if ((medicineFlags.isAnticoagulant && currentFlags.isAntiplatelet) || (medicineFlags.isAntiplatelet && currentFlags.isAnticoagulant)) {
    return true;
  }
  if (medicineFlags.isOpioidLike && hasBenzodiazepineNow) {
    return true;
  }

  return false;
};

const buildMedicationAllergyTerms = (payload, medicationKnowledge, fallbackMedication, drugClassInfo) => {
  const terms = new Set();
  const addTerm = (value) => {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized) {
      terms.add(normalized);
    }
  };

  [
    payload.medicineName,
    payload.normalizedDrugName,
    medicationKnowledge.normalizedDrugName,
    medicationKnowledge.rxnormMatchedName,
    medicationKnowledge.ingredientName,
    fallbackMedication.displayName,
    fallbackMedication.normalizedName,
    fallbackMedication.ingredientName,
  ].forEach(addTerm);

  getDrugClassTerms(drugClassInfo).forEach(addTerm);

  const therapeuticText = normalizeText(
    medicationKnowledge.therapeuticClass || fallbackMedication.therapeuticClass
  ).toLowerCase();

  if (therapeuticText.includes('penicillin')) {
    ['penicillin', 'penicillin antibiotic', 'beta-lactam', 'beta lactam'].forEach(addTerm);
  }
  if (therapeuticText.includes('sulfonamide') || therapeuticText.includes('sulfa')) {
    ['sulfa', 'sulfonamide', 'sulfa drug', 'sulfa drugs'].forEach(addTerm);
  }
  if (therapeuticText.includes('nsaid')) {
    ['nsaid', 'nonsteroidal anti-inflammatory', 'non steroidal anti inflammatory'].forEach(addTerm);
  }
  if (therapeuticText.includes('macrolide')) {
    ['macrolide', 'macrolide antibiotic'].forEach(addTerm);
  }
  if (therapeuticText.includes('fluoroquinolone')) {
    ['fluoroquinolone', 'quinolone antibiotic'].forEach(addTerm);
  }

  expandFamilyTerms(
    payload.medicineName,
    payload.normalizedDrugName,
    medicationKnowledge.ingredientName,
    medicationKnowledge.therapeuticClass,
    fallbackMedication.ingredientName,
    fallbackMedication.therapeuticClass
  ).forEach(addTerm);

  const blobForClass = [
    payload.medicineName,
    payload.normalizedDrugName,
    medicationKnowledge.ingredientName,
    medicationKnowledge.therapeuticClass,
    fallbackMedication.ingredientName,
    fallbackMedication.therapeuticClass,
  ].join(' ');
  if (getMedicationFlags(blobForClass).isNsaid || therapeuticText.includes('nsaid')) {
    ASPIRIN_SALICYLATE_ALLERGY_TERMS.forEach(addTerm);
    ['nsaid', 'nonsteroidal anti-inflammatory', 'non steroidal anti inflammatory'].forEach(addTerm);
  }

  return Array.from(terms);
};

const buildGuidelines = ({ riskLevel, medicationKnowledge, profile, payload, riskFactors }) => {
  const guidelines = [];

  if (riskLevel === 'Dangerous') {
    guidelines.push('Do not take this medicine until a doctor, pharmacist, or qualified clinician confirms it is safe for you.');
  } else if (riskLevel === 'Warning') {
    guidelines.push('Use caution and confirm this medicine with a pharmacist, caregiver, or doctor before taking it.');
  } else {
    guidelines.push('Use the medicine only as prescribed and keep monitoring for any new symptoms.');
  }

  if (profile?.hasMedicineAllergy) {
    guidelines.push('Because your profile records medicine allergies, keep a written allergy list with you when taking new medicines.');
  }

  if (payload?.takingOtherMedicinesNow || normalizeText(profile?.currentMedicationsText)) {
    guidelines.push('Check this medicine against your current medicines to avoid interaction problems.');
  }

  if (payload?.symptomMatch) {
    guidelines.push('If your symptoms become worse after taking the medicine, stop and seek medical advice promptly.');
  }

  if ((medicationKnowledge?.interactionCount || 0) > 0) {
    guidelines.push(`Potential medicine interaction found: ${medicationKnowledge.interactionCount} interaction(s) should be reviewed before use.`);
  }

  if ((medicationKnowledge?.sideEffectMatchCount || 0) > 0) {
    guidelines.push('Your reported symptoms overlap with known side effects, so this medicine needs extra caution.');
  }

  if ((riskFactors || []).some((factor) => factor.factorType === 'allergy_match' || factor.factorType === 'allergy_class_match')) {
    guidelines.push('A known allergy or medicine-family allergy match was detected in your history/profile.');
  }

  if ((riskFactors || []).some((factor) => factor.factorType === 'no_direct_penicillin_conflict')) {
    guidelines.push('No direct penicillin allergy conflict was detected for this medicine, but other clinical cautions still apply.');
  }

  return Array.from(new Set(guidelines));
};

const sanitizeAnalysisPayload = (body) => ({
  inputMethod: normalizeText(body.inputMethod) || 'manual',
  medicineName: normalizeText(body.medicineName),
  normalizedDrugName: normalizeText(body.normalizedDrugName || body.medicineName).toLowerCase(),
  dose: normalizeText(body.dose),
  frequency: normalizeText(body.frequency),
  takenBefore: normalizeYesNo(body.takenBefore),
  hadReactionBefore: normalizeYesNo(body.hadReactionBefore),
  symptomMatch: normalizeText(body.symptomMatch),
  severity: normalizeText(body.severity),
  takingOtherMedicinesNow: normalizeYesNo(body.takingOtherMedicinesNow),
  notes: normalizeText(body.notes),
  clinicalOverride: body.clinicalOverride && typeof body.clinicalOverride === 'object'
    ? {
        accepted: Boolean(body.clinicalOverride.accepted),
        justification: normalizeText(body.clinicalOverride.justification),
        documentedAt: body.clinicalOverride.documentedAt || null,
      }
    : null,
});

const buildAnalysis = async (payload, profile, questionnaireAnswers, medicineHistory = [], userId = null) => {
  const medicationKnowledge = await enrichMedication({
    medicineName: payload.normalizedDrugName || payload.medicineName,
    currentMedicationsText: profile?.currentMedicationsText,
    symptomMatch: payload.symptomMatch,
  });
  const fallbackMedication = await resolveMedication(payload.medicineName);
  const normalizedDrug = medicationKnowledge.normalizedDrugName || fallbackMedication.normalizedName || payload.medicineName.toLowerCase();
  const knownAllergiesText = normalizeText(profile?.knownAllergiesText).toLowerCase();
  const chronicDiseasesText = normalizeText(profile?.chronicDiseasesText).toLowerCase();
  const currentMedicationsText = normalizeText(profile?.currentMedicationsText).toLowerCase();
  const ageValue = Number.parseInt(profile?.age, 10);
  const currentMedicationCount = countListedItems(profile?.currentMedicationsText);
  const questionnaireText = questionnaireAnswers
    .map((item) => normalizeText(item.answerText).toLowerCase())
    .join(' ');
  const currentDrugClassInfo = resolveDrugClass(
    payload.normalizedDrugName,
    payload.medicineName,
    medicationKnowledge.ingredientName,
    fallbackMedication.ingredientName,
    medicationKnowledge.rxnormMatchedName
  );
  const medicationFlags = getMedicationFlags(
    payload.medicineName,
    payload.normalizedDrugName,
    medicationKnowledge.ingredientName,
    medicationKnowledge.therapeuticClass,
    fallbackMedication.ingredientName,
    fallbackMedication.therapeuticClass,
    ...getDrugClassTerms(currentDrugClassInfo)
  );

  const riskFactors = [];
  let ruleScore = 0;
  let shortCircuited = false;
  const addRule = (ruleId, factorLabel, severity, score, evidenceSource) => {
    if (shortCircuited) {
      return;
    }
    const factor = buildClinicalFactor(ruleId, { factorLabel, severity, score, evidenceSource });
    riskFactors.push(factor);
    ruleScore += factor.score;
    if (factor.shortCircuit) {
      shortCircuited = true;
    }
  };

  const allergyTerms = buildMedicationAllergyTerms(payload, medicationKnowledge, fallbackMedication, currentDrugClassInfo);
  const severeReactionSignal = hasSevereReactionSignal(payload, questionnaireText);
  const userAllergyEvidence = includesAnyTerm(knownAllergiesText, allergyTerms);
  const questionnaireAllergyEvidence = includesAnyTerm(questionnaireText, allergyTerms);
  const profileDrugClasses = new Set([
    ...extractDrugClassesFromText(profile?.knownAllergiesText),
    ...extractDrugClassesFromText(questionnaireText),
  ]);
  const hasPenicillinAllergyInProfile = includesAnyTerm(
    `${knownAllergiesText} ${questionnaireText}`,
    ['penicillin', 'penicillin antibiotic', 'beta-lactam', 'beta lactam', 'amoxicillin', 'ampicillin', 'augmentin']
  );
  let chronicRiskAssessment = {
    hasRisk: false,
    score: 0,
    label: '',
    hasAsthmaRisk: false,
    hasHypertensionRisk: false,
    hasCardioOrRenalRisk: false,
    hasAntihypertensiveUse: false,
  };

  if (userAllergyEvidence) {
    addRule(
      'P1',
      'This medicine directly matches a known allergy in the profile.',
      'high',
      80,
      'PATIENT_PROFILE'
    );
  }

  const historyRows = Array.isArray(medicineHistory) ? medicineHistory : [];
  let historyDangerousCount = 0;
  let historyWarningCount = 0;
  let historySafeCount = 0;
  if (historyRows.length > 0) {
    historyDangerousCount = historyRows.filter((h) => h.riskLevel === 'Dangerous').length;
    historyWarningCount = historyRows.filter((h) => h.riskLevel === 'Warning').length;
    historySafeCount = historyRows.filter((h) => h.riskLevel === 'Safe').length;
  }

  if (!shortCircuited) {
  const aspirinSalicylateInProfile =
    includesAnyTerm(knownAllergiesText, ASPIRIN_SALICYLATE_ALLERGY_TERMS) ||
    includesAnyTerm(questionnaireText, ASPIRIN_SALICYLATE_ALLERGY_TERMS);

  const maxAllergySeverity = resolveMaxAllergySeverity({
    profile,
    payload,
    questionnaireText: questionnaireText,
    severeReactionSignal,
  });

  if (
    !riskFactors.some((factor) => factor.factorType === 'allergy_match') &&
    medicationFlags.isNsaid &&
    aspirinSalicylateInProfile
  ) {
    addRule(
      'P3',
      `Aspirin/salicylate allergy with another NSAID (e.g. naproxen): high cross-reactivity — severity-adjusted (× ${maxAllergySeverity}).`,
      'high',
      scoreAllergyCrossReactivityRule(60, maxAllergySeverity)
    );
  }

  // P2: Check for drug class cross-reactivity (e.g., penicillin allergy + cephalosporin medicine)
  if (
    currentDrugClassInfo?.drug_class &&
    currentDrugClassInfo.drug_class !== 'unknown' &&
    !riskFactors.some((factor) => factor.factorType === 'allergy_match')
  ) {
    let foundCrossReactivity = false;
    let crossReactiveAllergyClass = null;

    for (const allergyClass of profileDrugClasses) {
      if (hasClassCrossReactivity(allergyClass, currentDrugClassInfo.drug_class)) {
        foundCrossReactivity = true;
        crossReactiveAllergyClass = allergyClass;
        break;
      }
    }

    if (foundCrossReactivity) {
      const p2Score = scoreAllergyCrossReactivityRule(65, maxAllergySeverity);
      addRule(
        'P2',
        `This medicine (${currentDrugClassInfo.drug_class}) cross-reacts with a known allergy (${crossReactiveAllergyClass}). Beta-lactam family members (penicillins, cephalosporins) have documented cross-reactivity. Severity-adjusted (× ${maxAllergySeverity}).`,
        'high',
        p2Score
      );
    }
  }

  if (payload.hadReactionBefore === true || questionnaireAllergyEvidence) {
    addRule('P9', 'Past reaction symptom match suggests extra caution.', 'medium', CLINICAL_RULES.P9.defaultScore);
  }

  if (medicationKnowledge.interactionCount > 0) {
    const severityScore = medicationKnowledge.maxInteractionSeverity === 'high'
      ? 60
      : medicationKnowledge.maxInteractionSeverity === 'medium'
        ? 30
        : 10;

    if (severityScore > 0) {
      addRule(
        'P4',
        `DDInter-style check found ${medicationKnowledge.interactionCount} possible interaction(s).`,
        medicationKnowledge.maxInteractionSeverity === 'high' ? 'high' : 'medium',
        severityScore,
        'DDInter'
      );
    }
  }

  if (medicationKnowledge.sideEffectMatchCount > 0) {
    addRule(
      'P7',
      `SIDER-style side-effect matching found ${medicationKnowledge.sideEffectMatchCount} overlap(s) with reported symptoms.`,
      'medium',
      12
    );
  }

  const addFactor = (factorType, factorLabel, severity, score) => {
    if (shortCircuited) {
      return;
    }
    const mapped = buildClinicalFactor(factorType, {
      factorLabel,
      severity,
      score,
      evidenceSource: 'SYSTEM',
    });
    riskFactors.push(mapped);
    ruleScore += score;
  };

  if (medicationFlags.isAnticoagulant || medicationFlags.isAntiplatelet) {
    addFactor(
      'high_caution_medicine',
      'This medicine is in a higher-caution blood-thinner or antiplatelet category and should be reviewed carefully before use.',
      'medium',
      18
    );
  }

  if (Number.isFinite(ageValue) && ageValue >= 65 && (medicationFlags.isAnticoagulant || medicationFlags.isAntiplatelet)) {
    addFactor(
      'elder_high_caution_medicine',
      'Older age increases caution for this blood-thinner or antiplatelet medicine.',
      'medium',
      12
    );
  }

  if (Number.isFinite(ageValue) && ageValue >= 65 && medicationFlags.isOpioidLike) {
    addFactor(
      'elder_sedation_risk',
      'This medicine can cause dizziness, drowsiness, or falls more easily in older adults.',
      'medium',
      18
    );
  }

  chronicRiskAssessment = assessChronicContraindicationRisk({
    chronicDiseasesText,
    currentMedicationsText: profile?.currentMedicationsText,
    therapeuticClass: medicationKnowledge.therapeuticClass || fallbackMedication.therapeuticClass,
    ingredientName: medicationKnowledge.ingredientName || fallbackMedication.ingredientName,
    medicineName: payload.medicineName,
  });
  if (medicationFlags.isNsaid && chronicRiskAssessment.hasAsthmaRisk) {
    addFactor(
      'nsaid_asthma_caution',
      'NSAID caution in asthma: this medicine may worsen wheezing or breathing symptoms and should be reviewed carefully.',
      'high',
      22
    );
  }
  if (medicationFlags.isNsaid && chronicRiskAssessment.hasHypertensionRisk) {
    addFactor(
      'nsaid_hypertension_caution',
      'NSAID may increase blood pressure: hypertension is recorded, so extra caution is needed.',
      'medium',
      15
    );
  }
  if (medicationFlags.isNsaid && chronicRiskAssessment.hasAntihypertensiveUse) {
    addFactor(
      'nsaid_antihypertensive_monitoring',
      'Monitor hypertension / antihypertensive effectiveness: NSAIDs can reduce blood-pressure control while using medicines such as amlodipine, ACE inhibitors, ARBs, beta blockers, or diuretics.',
      'medium',
      10
    );
  }
  if (chronicRiskAssessment.hasRisk && !medicationFlags.isNsaid) {
    addRule(
      'P8',
      chronicRiskAssessment.label || 'Hypertension/chronic condition plus NSAID class may increase medicine risk.',
      chronicRiskAssessment.hasAsthmaRisk ? 'high' : 'medium',
      chronicRiskAssessment.score || CLINICAL_RULES.P8.defaultScore
    );
  }
  if (
    hasPenicillinAllergyInProfile &&
    medicationFlags.isNsaid &&
    !medicationFlags.isPenicillinFamily &&
    !riskFactors.some((factor) => factor.factorType === 'allergy_match' || factor.factorType === 'allergy_class_match')
  ) {
    addFactor(
      'no_direct_penicillin_conflict',
      'No direct penicillin allergy conflict: the recorded penicillin allergy does not directly match this NSAID medicine, so the caution here comes from asthma, blood pressure, and current-medicine factors instead.',
      'low',
      0
    );
  }

  const profileAndQuestionnaireText = `${chronicDiseasesText} ${questionnaireText}`.toLowerCase();
  const isPregnant =
    /\bpregnant\b/.test(profileAndQuestionnaireText) &&
    !/\bnot pregnant\b/.test(profileAndQuestionnaireText) &&
    !/\bnot applicable\b/.test(profileAndQuestionnaireText);
  const pregnancyHighRiskTerms = [
    'warfarin',
    'methotrexate',
    'isotretinoin',
    'losartan',
    'enalapril',
    'lisinopril',
    'captopril',
    'ramipril',
    'ibuprofen',
    'naproxen',
    'diclofenac',
    'aspirin',
    'tetracycline',
    'doxycycline',
    'phenytoin',
    'valproate',
  ];
  const medicineCombined = [
    payload.medicineName,
    normalizedDrug,
    medicationKnowledge.ingredientName,
    medicationKnowledge.therapeuticClass,
  ]
    .map((value) => normalizeText(value).toLowerCase())
    .join(' ');
  if (
    isPregnant &&
    pregnancyHighRiskTerms.some((term) => medicineCombined.includes(term))
  ) {
    addRule(
      'P5',
      'Pregnancy status was recorded and this medicine is in a higher-risk category during pregnancy — clinician review is required before use.',
      'high',
      70
    );
  }

  if (hasDangerousMedicationCombination({
    medicineFlags: medicationFlags,
    currentMedicationsText: profile?.currentMedicationsText,
  })) {
    addRule(
      'P6',
      'A high-risk medicine combination pattern was detected (for example blood thinner with NSAID/antiplatelet, or opioid with sedative).',
      'high',
      32
    );
  }

  if (currentMedicationCount >= 5 || (payload.takingOtherMedicinesNow === true && currentMedicationCount >= 3)) {
    addRule('P10', 'Multiple current medicines increase polypharmacy risk.', 'medium', CLINICAL_RULES.P10.defaultScore);
  }

  if (Number.isFinite(ageValue) && ageValue >= 65) {
    addRule('P11', 'Elderly age may increase sensitivity to medicine risks and interactions.', 'medium', CLINICAL_RULES.P11.defaultScore);
  }

  if (medicationFlags.isNtiDrug) {
    addRule(
      'P12',
      'This medicine has a narrow therapeutic index — small dose changes can cause harm; clinician review is advised.',
      'medium',
      15
    );
  }

  const hasRenalImpairment = ['kidney', 'renal', 'ckd', 'dialysis', 'nephro'].some((term) => chronicDiseasesText.includes(term));
  const hasHepaticImpairment = ['liver', 'hepatic', 'cirrhosis', 'jaundice'].some((term) => chronicDiseasesText.includes(term));

  if (hasRenalImpairment && medicationFlags.isRenalExcretion) {
    addRule(
      'P13',
      'Kidney disease was recorded and this medicine is primarily renally cleared — dose and safety review are important.',
      'medium',
      CLINICAL_RULES.P13.defaultScore
    );
  }

  if (hasHepaticImpairment && medicationFlags.isHepaticMetabolism) {
    addRule(
      'P14',
      'Liver disease was recorded and this medicine is primarily hepatically metabolized — dose and safety review are important.',
      'medium',
      CLINICAL_RULES.P14.defaultScore
    );
  }

  if (medicationKnowledge.matched === false) {
    addRule(
      'P16',
      'This name did not match the local RxNorm/SIDER dictionary well — side effects and interactions may be incomplete until the spelling or strength is corrected.',
      'medium',
      12
    );
  }

  if (historyRows.length > 0) {
    const latest = historyRows[0];
    let histScore = 0;
    if (latest?.riskLevel === 'Dangerous') {
      histScore += 30;
    } else if (latest?.riskLevel === 'Warning') {
      histScore += 18;
    } else if (latest?.riskLevel === 'Safe') {
      histScore += 4;
    }
    if (historyDangerousCount >= 2) {
      histScore += 25;
    } else if (historyDangerousCount === 1 && historyWarningCount >= 1) {
      histScore += 12;
    }
    if (historyWarningCount >= 3 && historyDangerousCount === 0) {
      histScore += 14;
    }
    histScore = Math.min(45, histScore);
    const histSeverity =
      latest?.riskLevel === 'Dangerous' || historyDangerousCount >= 2
        ? 'high'
        : latest?.riskLevel === 'Warning'
          ? 'medium'
          : 'low';
    addRule(
      'P15',
      `Your medicine history includes ${historyRows.length} prior check(s) for this drug: ${historyDangerousCount} Dangerous, ${historyWarningCount} Warning, ${historySafeCount} Safe (latest: ${latest?.riskLevel || 'unknown'}).`,
      histSeverity,
      histScore
    );
  }
  } // end if (!shortCircuited) — P1 skips lower-priority rules (Section 12.2)

  const hasDirectAllergyMatch = riskFactors.some((factor) => factor.factorType === 'allergy_match' || factor.ruleId === 'P1');
  const hasNsaidAspirinCross = riskFactors.some((factor) => factor.factorType === 'nsaid_aspirin_cross_allergy');
  const hasClassAllergyMatch = riskFactors.some((factor) => factor.factorType === 'allergy_class_match');
  const hasAllergyMatch = hasDirectAllergyMatch || hasClassAllergyMatch || hasNsaidAspirinCross;
  const hasPastReaction = riskFactors.some((factor) => factor.factorType === 'past_reaction');
  const hasHighInteraction = medicationKnowledge.maxInteractionSeverity === 'high';
  const hasMediumOrHighInteraction = ['high', 'medium'].includes(medicationKnowledge.maxInteractionSeverity);
  const hasAnyInteraction = medicationKnowledge.interactionCount > 0;
  const hasDangerousCombination = riskFactors.some((factor) => factor.factorType === 'dangerous_combination');
  const hasChronicRisk = riskFactors.some((factor) => factor.factorType === 'chronic_condition');
  const hasGeneralCautionMedicine =
    medicationFlags.isNsaid ||
    medicationFlags.isAnticoagulant ||
    medicationFlags.isAntiplatelet ||
    medicationFlags.isOpioidLike;

  if (hasDirectAllergyMatch && (hasPastReaction || severeReactionSignal)) {
    ruleScore = Math.max(ruleScore, 95);
  } else if (hasDirectAllergyMatch) {
    ruleScore = Math.max(ruleScore, 85);
  }

  if (hasClassAllergyMatch && (hasPastReaction || severeReactionSignal)) {
    ruleScore = Math.max(ruleScore, 70);
  } else if (hasClassAllergyMatch) {
    ruleScore = Math.max(ruleScore, 60);
  }

  if (hasNsaidAspirinCross) {
    ruleScore = Math.max(ruleScore, 65);
  }

  if (hasDirectAllergyMatch && hasHighInteraction) {
    ruleScore = Math.max(ruleScore, 100);
  }

  if (hasAllergyMatch && (hasPastReaction || severeReactionSignal)) {
    ruleScore = Math.max(ruleScore, 75);
  }

  if (hasHighInteraction && (hasGeneralCautionMedicine || hasChronicRisk)) {
    ruleScore = Math.max(ruleScore, 70);
  } else if (hasHighInteraction) {
    ruleScore = Math.max(ruleScore, 60);
  }

  if (hasDangerousCombination) {
    ruleScore = Math.max(ruleScore, 72);
  }

  // Past severe symptoms + interactions deserve extra caution, but minor-only DDInter rows
  // should not pin the rule score near maximum (e.g. antihistamine + metformin "low").
  if (severeReactionSignal && hasAnyInteraction) {
    if (hasHighInteraction) {
      ruleScore = Math.max(ruleScore, 78);
    } else if (hasMediumOrHighInteraction) {
      ruleScore = Math.max(ruleScore, 66);
    } else {
      ruleScore = Math.max(ruleScore, 44);
    }
  }

  if (Number.isFinite(ageValue) && ageValue >= 75 && (hasGeneralCautionMedicine || hasMediumOrHighInteraction)) {
    ruleScore = Math.max(ruleScore, 45);
  }

  if (severeReactionSignal && !hasAllergyMatch) {
    ruleScore = Math.max(ruleScore, 40);
  }

  if (historyRows.length > 0) {
    if (historyDangerousCount >= 2) {
      ruleScore = Math.max(ruleScore, 68);
    } else if (historyDangerousCount >= 1) {
      ruleScore = Math.max(ruleScore, 52);
    } else if (historyWarningCount >= 2 && historyDangerousCount === 0) {
      ruleScore = Math.max(ruleScore, 38);
    }
  }

  if (medicationFlags.isNsaid && chronicRiskAssessment.hasAsthmaRisk && chronicRiskAssessment.hasHypertensionRisk) {
    ruleScore = Math.max(ruleScore, 40);
  } else if (medicationFlags.isNsaid && chronicRiskAssessment.hasAsthmaRisk) {
    ruleScore = Math.max(ruleScore, 32);
  }

  if ((hasMediumOrHighInteraction || hasGeneralCautionMedicine || severeReactionSignal) && ruleScore < 15) {
    ruleScore = 15;
  }

  const benignLowOnly = isBenignLowSeverityOnlyInteractionContext({
    medicationKnowledge,
    riskFactors,
    hasDirectAllergyMatch,
    hasClassAllergyMatch,
    hasNsaidAspirinCross,
    hasDangerousCombination,
    hasHighInteraction,
  });
  if (benignLowOnly && ruleScore >= 60) {
    ruleScore = Math.min(ruleScore, 58);
  }

  ruleScore = Math.min(ruleScore, 100);

  const anonymizedUserId = anonymizeUserIdForAudit(userId);
  const ruleAuditTrail = buildRuleAuditTrail({
    riskFactors,
    anonymizedUserId,
    drugName: payload.medicineName,
    normalizedDrugName: normalizedDrug,
  });
  const p1ShortCircuited = shortCircuited;

  if (p1ShortCircuited) {
    ruleScore = applyP1ShortCircuit({ ruleScore, riskLevel: 'Dangerous' }).ruleScore;
  }

  const riskScore = ruleScore;
  let riskLevel = 'Safe';

  if (p1ShortCircuited) {
    riskLevel = 'Dangerous';
  } else if (riskScore >= RISK_THRESHOLDS.dangerousMin) {
    riskLevel = 'Dangerous';
  } else if (riskScore >= RISK_THRESHOLDS.warningMin) {
    riskLevel = 'Warning';
  }

  const explanationParts = riskFactors.slice(0, 3).map((factor) => factor.factorLabel);
  const explanation = explanationParts.length > 0
    ? explanationParts.join(' ')
    : 'No strong warning signs were found in the saved profile, but continue checking carefully.';

  let recommendation = 'Use as directed and keep monitoring for any unusual reaction.';
  if (p1ShortCircuited) {
    recommendation = applyP1ShortCircuit({ ruleScore, riskLevel }).shortCircuitReason;
  } else if (riskLevel === 'Warning') {
    recommendation = 'Use caution and talk to a pharmacist or caregiver before taking this medicine.';
  } else if (riskLevel === 'Dangerous') {
    recommendation = 'Do not take this medicine until you speak to a doctor or qualified clinician.';
  }

  const guidelines = buildGuidelines({
    riskLevel,
    medicationKnowledge,
    profile,
    payload,
    riskFactors,
  });

  return {
    title: `${payload.medicineName || 'Medicine'} Safety Check`,
    medicineName: payload.medicineName,
    normalizedDrugName: normalizedDrug,
    rxnormCui: medicationKnowledge.rxnormCui,
    ingredientName: medicationKnowledge.ingredientName,
    therapeuticClass: medicationKnowledge.therapeuticClass,
    status: 'completed',
    riskScore,
    riskLevel,
    sideEffectCount: medicationKnowledge.sideEffectCount,
    severeSideEffectCount: medicationKnowledge.severeSideEffectCount,
    sideEffectMatchCount: medicationKnowledge.sideEffectMatchCount,
    interactionCount: medicationKnowledge.interactionCount,
    maxInteractionSeverity: medicationKnowledge.maxInteractionSeverity,
    knowledgeSources: medicationKnowledge.knowledgeSources,
    explanation,
    recommendation,
    guidelines,
    riskFactors,
    historyEntry: {
      inputMethod: payload.inputMethod,
      rawInput: payload.notes || payload.medicineName,
      medicineName: payload.medicineName,
      normalizedDrugName: normalizedDrug,
      rxnormCui: medicationKnowledge.rxnormCui,
      ingredientName: medicationKnowledge.ingredientName,
      therapeuticClass: medicationKnowledge.therapeuticClass,
      dose: payload.dose,
      frequency: payload.frequency,
      riskScore,
      riskLevel,
      sideEffectCount: medicationKnowledge.sideEffectCount,
      severeSideEffectCount: medicationKnowledge.severeSideEffectCount,
      sideEffectMatchCount: medicationKnowledge.sideEffectMatchCount,
      interactionCount: medicationKnowledge.interactionCount,
      maxInteractionSeverity: medicationKnowledge.maxInteractionSeverity,
      knowledgeSources: medicationKnowledge.knowledgeSources,
    },
    medicationKnowledge: {
      rxnormCui: medicationKnowledge.rxnormCui,
      rxnormMatchedName: medicationKnowledge.rxnormMatchedName,
      ingredientName: medicationKnowledge.ingredientName,
      therapeuticClass: medicationKnowledge.therapeuticClass,
      commonSideEffects: medicationKnowledge.commonSideEffects,
      severeSideEffects: medicationKnowledge.severeSideEffects,
      sideEffectMatches: medicationKnowledge.sideEffectMatches,
      interactions: medicationKnowledge.interactions,
      knowledgeSources: medicationKnowledge.knowledgeSources,
      whoAtc: medicationKnowledge.whoAtc || null,
    },
    dataUsed: {
      profileFields: [
        'age',
        'gender',
        'hasMedicineAllergy',
        'knownAllergiesText',
        'chronicDiseasesText',
        'currentMedicationsText',
        'emergencyContact',
        'caregiverDetails',
      ],
      questionnaireAnswerCount: questionnaireAnswers.length,
      medicationKnowledgeSources: medicationKnowledge.knowledgeSources,
      derivedDrugClass: currentDrugClassInfo?.drug_class || null,
      derivedDrugClassAtcCode: currentDrugClassInfo?.atc_code || null,
      knowledgeMatched: medicationKnowledge.matched !== false,
      historyPriorCheckCount: historyRows.length,
      historyDangerousCount,
      historyWarningCount,
      historySafeCount,
      historyLatestRiskLevel: historyRows[0]?.riskLevel || null,
      ruleScore,
      p1ShortCircuited,
      ruleAuditTrail,
      ruleEngine: {
        format: 'CLIPS-adapted',
        catalogVersion: 'P1-P16',
        triggeredRuleIds: ruleAuditTrail.map((entry) => entry.ruleId),
        shortCircuited: p1ShortCircuited,
      },
      currentCheckFields: [
        'medicineName',
        'dose',
        'frequency',
        'takenBefore',
        'hadReactionBefore',
        'symptomMatch',
        'severity',
        'takingOtherMedicinesNow',
        'notes',
      ],
    },
  };
};

const applyMlPrediction = (analysisPayload, mlPrediction) => {
  if (!mlPrediction?.available) {
    return analysisPayload;
  }

  const ruleScore = Number(analysisPayload.dataUsed?.ruleScore ?? analysisPayload.riskScore ?? 0);
  const ruleRiskLevel = classifyRiskLevel(ruleScore);
  const rawMlScore = Number.isFinite(Number(mlPrediction.mlRiskScore))
    ? Number(mlPrediction.mlRiskScore)
    : Math.max(
        0,
        Math.min(
          100,
          Math.round(Number(mlPrediction.probabilityDangerous ?? mlPrediction.probability ?? 0) * 100)
        )
      );
  const mlClassConf = Number.isFinite(Number(mlPrediction.mlClassConfidenceScore))
    ? Number(mlPrediction.mlClassConfidenceScore)
    : Math.max(0, Math.min(100, Math.round(Number(mlPrediction.probability || 0) * 100)));
  const youdensJ = mlPrediction.youdensJThreshold || null;
  const youdenThreshold = youdensJ?.optimal_threshold != null ? Number(youdensJ.optimal_threshold) : null;
  const adrRiskProbability = Number(
    mlPrediction.adrRiskProbability ?? mlPrediction.probabilityDangerous ?? mlPrediction.probability ?? 0
  );
  let adjustedMlScore = rawMlScore;
  let mlAdjustmentReason = null;

  if (ruleScore < 20 && rawMlScore > 80) {
    adjustedMlScore = 70;
    mlAdjustmentReason = 'weak_rule_high_ml_cap';
  }

  if (
    shouldLimitWeakEvidenceMlLift({
      analysisPayload,
      ruleScore,
      rawMlScore,
      adrRiskProbability,
      youdenThreshold,
    })
  ) {
    const safeCeiling = weakEvidenceMlSafeCeiling(ruleScore);
    if (safeCeiling < adjustedMlScore) {
      adjustedMlScore = safeCeiling;
      mlAdjustmentReason = 'weak_rule_safe_class_cap';
    }
  }

  const mlScoreWasCapped = adjustedMlScore !== rawMlScore;
  const scoreGap = Math.abs(ruleScore - rawMlScore);
  const hybridBlend = blendHybridScore(ruleScore, adjustedMlScore);
  let combinedRiskScore = hybridBlend.blendedScore;
  let combinedRiskLevel = classifyRiskLevel(combinedRiskScore);

  if (compareRiskLevel(ruleRiskLevel, combinedRiskLevel) > 0) {
    combinedRiskLevel = ruleRiskLevel;
    if (ruleRiskLevel === 'Dangerous') {
      combinedRiskScore = Math.max(combinedRiskScore, RISK_THRESHOLDS.dangerousMin);
    } else if (ruleRiskLevel === 'Warning') {
      combinedRiskScore = Math.max(combinedRiskScore, RISK_THRESHOLDS.warningMin);
    }
  }

  const hasNsaidAspirinCrossFactor = (analysisPayload.riskFactors || []).some(
    (factor) => factor.factorType === 'nsaid_aspirin_cross_allergy'
  );
  const hasDangerousComboFactor = (analysisPayload.riskFactors || []).some((factor) => factor.factorType === 'dangerous_combination');
  const hasHighInteractionFactor = (analysisPayload.riskFactors || []).some(
    (factor) => factor.factorType === 'ddinter_interaction' && factor.severity === 'high'
  );

  // Section 12.2 — P1 direct allergy short-circuit: ML cannot downgrade documented allergy match.
  if (shouldBlockMlDowngrade(analysisPayload)) {
    combinedRiskLevel = 'Dangerous';
    combinedRiskScore = Math.max(combinedRiskScore, 85);
  } else if (hasNsaidAspirinCrossFactor || hasHighInteractionFactor) {
    combinedRiskLevel = 'Dangerous';
    combinedRiskScore = Math.max(combinedRiskScore, 75);
  } else if (hasDangerousComboFactor && compareRiskLevel(combinedRiskLevel, 'Warning') < 0) {
    combinedRiskLevel = 'Warning';
    combinedRiskScore = Math.max(combinedRiskScore, 35);
  }

  const histDangerous = Number(analysisPayload.dataUsed?.historyDangerousCount || 0);
  const histWarning = Number(analysisPayload.dataUsed?.historyWarningCount || 0);
  if (histDangerous >= 2 && !isBenignLowSeverityOnlyInteractionAnalysis(analysisPayload)) {
    combinedRiskLevel = 'Dangerous';
    combinedRiskScore = Math.max(combinedRiskScore, 72);
  } else if (histDangerous >= 1) {
    combinedRiskScore = Math.max(combinedRiskScore, 40);
    if (compareRiskLevel(combinedRiskLevel, 'Warning') < 0) {
      combinedRiskLevel = 'Warning';
    }
  } else if (histWarning >= 2 && histDangerous === 0 && compareRiskLevel(combinedRiskLevel, 'Warning') < 0) {
    combinedRiskLevel = 'Warning';
    combinedRiskScore = Math.max(combinedRiskScore, 28);
  }

  const riskFactors = [...analysisPayload.riskFactors];
  const capNote = mlScoreWasCapped
    ? mlAdjustmentReason === 'weak_rule_safe_class_cap'
      ? ` Hybrid protection applied: raw ML ADR Probability Score ${rawMlScore}/100 was adjusted to ${adjustedMlScore}/100 because rule evidence was minimal and the ML model still remained below its severe-ADR threshold.`
      : ` Hybrid protection applied: raw ML ADR Probability Score ${rawMlScore}/100 was adjusted to ${adjustedMlScore}/100 because rule evidence was still weak.`
    : '';
  const thresholdNote =
    youdenThreshold != null
      ? ` Youden's J tuned threshold: P(ADR) ≥ ${youdenThreshold.toFixed(3)} → severe ADR.`
      : '';
  riskFactors.push({
    factorType: 'ml_prediction',
    factorLabel: `Baseline ML ADR Probability Score: P(ADR) ~ ${rawMlScore}/100; predicted class ${mlPrediction.mlRiskLevel || 'n/a'} (confidence ~ ${mlClassConf}/100).${capNote}${thresholdNote}`,
    severity: mlPrediction.mlRiskLevel === 'Dangerous' ? 'high' : mlPrediction.mlRiskLevel === 'Warning' ? 'medium' : 'low',
    score: adjustedMlScore,
  });

  let mlExplanation = `Rule score was ${ruleScore}/100. ML ADR Probability Score was ${rawMlScore}/100 (predicted ${mlPrediction.mlRiskLevel || 'n/a'} with ~${mlClassConf}/100 class confidence).`;
  if (mlScoreWasCapped) {
    if (mlAdjustmentReason === 'weak_rule_safe_class_cap') {
      mlExplanation += ` Because rule evidence was minimal and the ML probability stayed below its severe-ADR threshold, the hybrid calculation used an adjusted ML score of ${adjustedMlScore}/100 so a generic background ADR signal could not upgrade the case to warning on its own.`;
    } else {
      mlExplanation += ` Because rule evidence was below 20/100, the hybrid calculation used an adjusted ML score of ${adjustedMlScore}/100 to avoid overconfident weighting.`;
    }
  }
  if (scoreGap >= 35) {
    mlExplanation +=
      ' A large gap between rule score and ML score can happen because the rule score measures case-specific clinical contraindications, while the ML score estimates general severe-ADR probability from FAERS-style patterns. Direct allergy-match and cross-reactivity evidence are intentionally kept on the rule side.';
  }
  mlExplanation += ` Hybrid score = ${HYBRID_RULE_WEIGHT}xrule + ${HYBRID_ML_WEIGHT}xML = ${combinedRiskScore}/100.`;
  if (youdenThreshold != null) {
    mlExplanation += ` ML binary class uses Youden's J threshold P(ADR) ≥ ${youdenThreshold.toFixed(3)} (not default 0.5).`;
  }
  const mlLevel = mlPrediction.mlRiskLevel || 'Safe';
  if (compareRiskLevel(ruleRiskLevel, combinedRiskLevel) > 0) {
    mlExplanation += ` Clinical safety guardrails kept the final result at ${combinedRiskLevel.toLowerCase()} instead of allowing the ML blend to downgrade it.`;
  } else if (mlLevel === combinedRiskLevel) {
    mlExplanation += ` The ML predicted class (${mlLevel}) matches the final ${combinedRiskLevel.toLowerCase()} band.`;
  } else if (compareRiskLevel(ruleRiskLevel, mlLevel) > 0) {
    mlExplanation +=
      ' The clinical rule-based factors showed higher concern than the ML model; when they disagree, the stricter clinical side drives the risk band.';
  } else if (compareRiskLevel(mlLevel, ruleRiskLevel) > 0) {
    mlExplanation +=
      ' The ML model showed higher concern than the rule-only factors; the blended score partly reflects that signal.';
  } else {
    mlExplanation += ' Rule-based and ML estimates were in a similar range; the blended score combines both.';
  }

  const priorN = Number(analysisPayload.dataUsed?.historyPriorCheckCount || 0);
  if (priorN > 0) {
    mlExplanation += ` Prior checks you saved for this medicine (${priorN}) were folded into the clinical rule score and can lift the final level when they were high risk.`;
  }
  if (analysisPayload.dataUsed?.knowledgeMatched === false) {
    mlExplanation += ' The name did not match our local drug dictionary strongly — confirm spelling or strength so public interaction data applies.';
  }

  return {
    ...analysisPayload,
    riskScore: combinedRiskScore,
    riskLevel: combinedRiskLevel,
    riskFactors,
    explanation: `${analysisPayload.explanation} ${mlExplanation}`,
    medicationKnowledge: {
      ...analysisPayload.medicationKnowledge,
      mlPrediction: {
        available: true,
        target: mlPrediction.target,
        adrRiskProbability: mlPrediction.adrRiskProbability,
        probability: mlPrediction.probability,
        probabilityDangerous: mlPrediction.probabilityDangerous,
        probabilityWarning: mlPrediction.probabilityWarning,
        probabilitySafe: mlPrediction.probabilitySafe,
        mlRiskScore: adjustedMlScore,
        rawMlRiskScore: rawMlScore,
        adjustedMlRiskScore: adjustedMlScore,
        mlScoreWasCapped,
        mlAdjustmentReason,
        mlClassConfidenceScore: mlClassConf,
        mlRiskLevel: mlPrediction.mlRiskLevel,
        youdensJThreshold: youdensJ,
        shap: mlPrediction.shap || null,
        featurePayload: mlPrediction.featurePayload || null,
      },
    },
    historyEntry: {
      ...analysisPayload.historyEntry,
      riskScore: combinedRiskScore,
      riskLevel: combinedRiskLevel,
    },
    dataUsed: {
      ...(analysisPayload.dataUsed || {}),
      mlEnabled: true,
      ruleScore,
      mlScore: adjustedMlScore,
      rawMlScore,
      adjustedMlScore,
      mlScoreWasCapped,
      mlAdjustmentReason,
      mlClassConfidenceScore: mlClassConf,
      hybridBreakdown: {
        alpha: hybridBlend.alpha,
        beta: hybridBlend.beta,
        formula: hybridBlend.formula,
        ruleScore,
        rawMlScore,
        adjustedMlScore,
        mlAdjustmentReason,
        blendedScore: combinedRiskScore,
        ruleRiskLevel,
        mlRiskLevel: mlPrediction.mlRiskLevel || 'Safe',
        youdensJThreshold: youdensJ,
        finalRiskLevel: combinedRiskLevel,
      },
      riskReport: buildRiskReport({
        riskLevel: combinedRiskLevel,
        riskScore: combinedRiskScore,
        ruleScore,
        mlDangerScore: adjustedMlScore,
        hybridBreakdown: {
          alpha: hybridBlend.alpha,
          beta: hybridBlend.beta,
          formula: hybridBlend.formula,
          ruleScore,
          rawMlScore,
          adjustedMlScore,
          blendedScore: combinedRiskScore,
        },
        riskFactors,
        guidelines: analysisPayload.guidelines,
        profile: analysisPayload.dataUsed?.profileSnapshot || null,
        drugClassInfo: {
          drug_class: analysisPayload.dataUsed?.derivedDrugClass,
          atc_code: analysisPayload.dataUsed?.derivedDrugClassAtcCode || analysisPayload.medicationKnowledge?.whoAtc?.atcCode,
          atc_group_code: analysisPayload.medicationKnowledge?.whoAtc?.atcGroupCode,
          atc_group_name: analysisPayload.medicationKnowledge?.whoAtc?.atcGroupName,
          atc_class_label: analysisPayload.medicationKnowledge?.whoAtc?.atcClassLabel,
        },
        medicationKnowledge: analysisPayload.medicationKnowledge,
        mlPrediction,
        clinicalOverride: analysisPayload.dataUsed?.clinicalOverride,
      }),
    },
  };
};

const fetchProfile = async (req, res, next) => {
  try {
    const profile = await allergyModel.getProfile(req.user.id);
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
};

const saveProfile = async (req, res, next) => {
  try {
    const sanitized = sanitizeProfilePayload(req.body);
    const validation = validateProfileBody(sanitized);
    if (!validation.valid && sanitized.profileCompleted) {
      return res.status(400).json(validationErrorResponse(validation));
    }
    const profile = await allergyModel.upsertProfile(req.user.id, sanitized);
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
};

const fetchQuestionnaire = async (req, res, next) => {
  try {
    const answers = await allergyModel.listQuestionnaireAnswers(req.user.id);
    return res.json({ answers });
  } catch (error) {
    return next(error);
  }
};

const saveQuestionnaire = async (req, res, next) => {
  try {
    const answers = sanitizeQuestionnaireAnswers(req.body.answers);

    if (!answers) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    const savedAnswers = await allergyModel.replaceQuestionnaireAnswers(req.user.id, answers);
    return res.json({ answers: savedAnswers });
  } catch (error) {
    return next(error);
  }
};

const fetchCards = async (req, res, next) => {
  try {
    const cards = await allergyModel.listCards(req.user.id);
    return res.json({ cards });
  } catch (error) {
    return next(error);
  }
};

const fetchCard = async (req, res, next) => {
  try {
    const cardId = Number(req.params.id);
    if (!Number.isInteger(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' });
    }

    const card = await allergyModel.getCardById(req.user.id, cardId);
    if (!card) {
      return res.status(404).json({ error: 'Allergy card not found' });
    }

    return res.json({ card });
  } catch (error) {
    return next(error);
  }
};

const createCard = async (req, res, next) => {
  try {
    const payload = sanitizeCardPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const card = await allergyModel.createCard(req.user.id, payload);
    return res.status(201).json({ card });
  } catch (error) {
    return next(error);
  }
};

const saveCard = async (req, res, next) => {
  try {
    const cardId = Number(req.params.id);
    if (!Number.isInteger(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' });
    }

    const payload = sanitizeCardPayload(req.body);
    const card = await allergyModel.updateCard(req.user.id, cardId, payload);

    if (!card) {
      return res.status(404).json({ error: 'Allergy card not found' });
    }

    return res.json({ card });
  } catch (error) {
    return next(error);
  }
};

const fetchHistory = async (req, res, next) => {
  try {
    const history = await allergyModel.listHistory(req.user.id);
    return res.json({ history });
  } catch (error) {
    return next(error);
  }
};

const fetchReactions = async (req, res, next) => {
  try {
    const reactions = await allergyModel.listReactionLogs(req.user.id);
    return res.json({ reactions });
  } catch (error) {
    return next(error);
  }
};

const createReaction = async (req, res, next) => {
  try {
    const payload = sanitizeReactionPayload(req.body);
    const validation = validateReactionBody(payload);
    if (!validation.valid) {
      return res.status(400).json(validationErrorResponse(validation));
    }

    const profile = await allergyModel.getProfile(req.user.id);
    payload.consentForTraining = Boolean(profile.feedbackConsentForTraining);

    if (payload.severity === 'none' && !payload.symptoms) {
      payload.symptoms = 'No reaction reported';
    }

    if (!REACTION_OUTCOMES.includes(payload.severity)) {
      return res.status(400).json({
        error: `severity must be one of: ${REACTION_OUTCOMES.join(', ')}`,
      });
    }

    const reaction = await allergyModel.createReactionLog(req.user.id, payload);
    return res.status(201).json({ reaction, consentForTraining: payload.consentForTraining });
  } catch (error) {
    return next(error);
  }
};

const createClinicalOverride = async (req, res, next) => {
  try {
    const payload = sanitizeClinicalOverridePayload(req.body);

    if (!payload.justification || payload.justification.length < 10) {
      return res.status(400).json({
        error: 'Clinical override justification is required (minimum 10 characters).',
      });
    }

    const profile = await allergyModel.getProfile(req.user.id);
    payload.consentForTraining = Boolean(profile.feedbackConsentForTraining);

    const override = await allergyModel.createClinicalOverrideLog(req.user.id, {
      ...payload,
      symptoms: payload.medicineName
        ? `Override for ${payload.medicineName} (${payload.riskLevel})`
        : `Clinical override (${payload.riskLevel})`,
    });

    return res.status(201).json({ override, consentForTraining: payload.consentForTraining });
  } catch (error) {
    return next(error);
  }
};

const analyzeMedicine = async (req, res, next) => {
  try {
    const payload = sanitizeAnalysisPayload(req.body);
    const validation = validateAnalysisBody(payload);
    if (!validation.valid) {
      return res.status(400).json(validationErrorResponse(validation));
    }

    const prelimDrug = await resolveMedication(payload.normalizedDrugName || payload.medicineName);

    const [profile, questionnaireAnswers, medicineHistory] = await Promise.all([
      allergyModel.getProfile(req.user.id),
      allergyModel.listQuestionnaireAnswers(req.user.id),
      allergyModel.listHistoryMatchesForMedicine(req.user.id, {
        normalizedDrugName: prelimDrug.normalizedName,
        rxnormCui: prelimDrug.rxnormCui,
        medicineName: payload.medicineName,
      }),
    ]);

    const ruleAnalysis = await buildAnalysis(payload, profile, questionnaireAnswers, medicineHistory, req.user.id);
    logClinicalRuleAudit(ruleAnalysis.dataUsed?.ruleAuditTrail);
    ruleAnalysis.dataUsed = {
      ...(ruleAnalysis.dataUsed || {}),
      profileSnapshot: profile,
      clinicalOverride: payload.clinicalOverride,
    };
    const mlPrediction = await predictMedicineRisk({
      analysisPayload: ruleAnalysis,
      profile,
      questionnaireAnswers,
    });
    const analysisPayload = applyMlPrediction(ruleAnalysis, mlPrediction);
    const responseMlPrediction = analysisPayload.medicationKnowledge?.mlPrediction?.available
      ? analysisPayload.medicationKnowledge.mlPrediction
      : mlPrediction;
    const inputPipeline = buildPipelineReport({
      inputMethod: payload.inputMethod,
      rawInput: payload.notes || payload.medicineName,
      medicineName: payload.medicineName,
      normalizedDrugName: analysisPayload.normalizedDrugName,
      medicationKnowledge: analysisPayload.medicationKnowledge,
    });
    const card = await allergyModel.createCard(req.user.id, analysisPayload);

    return res.status(201).json({
      card,
      analysis: {
        riskScore: analysisPayload.riskScore,
        riskLevel: analysisPayload.riskLevel,
        explanation: analysisPayload.explanation,
        recommendation: analysisPayload.recommendation,
        guidelines: analysisPayload.guidelines,
        riskFactors: analysisPayload.riskFactors,
        medicationKnowledge: analysisPayload.medicationKnowledge,
        mlPrediction: responseMlPrediction,
        inputPipeline,
        riskReport: analysisPayload.dataUsed?.riskReport || null,
        ruleAuditTrail: analysisPayload.dataUsed?.ruleAuditTrail || [],
        dataUsed: {
          ...(analysisPayload.dataUsed || {}),
          inputPipeline,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  fetchProfile,
  saveProfile,
  fetchQuestionnaire,
  saveQuestionnaire,
  fetchCards,
  fetchCard,
  createCard,
  saveCard,
  fetchHistory,
  fetchReactions,
  createReaction,
  createClinicalOverride,
  analyzeMedicine,
};
