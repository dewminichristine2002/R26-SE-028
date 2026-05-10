const allergyModel = require('../models/allergyModel');
const {
  enrichMedication,
  resolveMedication,
} = require('../services/medicationKnowledgeService');
const { predictMedicineRisk } = require('../services/mlPredictionService');
const {
  resolveDrugClass,
  getDrugClassTerms,
  extractDrugClassesFromText,
} = require('../services/drugClassLookupService');

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

const sanitizeReactionPayload = (body) => ({
  medicineCheckId: Number.isFinite(Number(body.medicineCheckId)) ? Number(body.medicineCheckId) : null,
  symptoms: normalizeText(body.symptoms),
  severity: normalizeText(body.severity),
  notes: normalizeText(body.notes),
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

const hasChronicContraindicationRisk = ({ chronicDiseasesText, therapeuticClass, ingredientName, medicineName }) => {
  const chronic = normalizeText(chronicDiseasesText).toLowerCase();
  const medicineText = [therapeuticClass, ingredientName, medicineName].map((value) => normalizeText(value).toLowerCase()).join(' ');

  if (!chronic || !medicineText) {
    return false;
  }

  const flags = getMedicationFlags(therapeuticClass, ingredientName, medicineName);
  const hasCardioOrRenalRisk = ['hypertension', 'kidney', 'renal', 'heart failure', 'cardiac', 'diabetes'].some((term) => chronic.includes(term));
  const hasBleedingRisk = ['ulcer', 'bleeding', 'gastritis', 'stomach bleed'].some((term) => chronic.includes(term));

  if (flags.isNsaid && hasCardioOrRenalRisk) {
    return true;
  }

  if ((flags.isAnticoagulant || flags.isAntiplatelet) && hasBleedingRisk) {
    return true;
  }

  return false;
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
});

const buildAnalysis = (payload, profile, questionnaireAnswers, medicineHistory = []) => {
  const medicationKnowledge = enrichMedication({
    medicineName: payload.normalizedDrugName || payload.medicineName,
    currentMedicationsText: profile?.currentMedicationsText,
    symptomMatch: payload.symptomMatch,
  });
  const fallbackMedication = resolveMedication(payload.medicineName);
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
  const allergyTerms = buildMedicationAllergyTerms(payload, medicationKnowledge, fallbackMedication, currentDrugClassInfo);
  const severeReactionSignal = hasSevereReactionSignal(payload, questionnaireText);
  const userAllergyEvidence = includesAnyTerm(knownAllergiesText, allergyTerms);
  const questionnaireAllergyEvidence = includesAnyTerm(questionnaireText, allergyTerms);
  const profileDrugClasses = new Set([
    ...extractDrugClassesFromText(profile?.knownAllergiesText),
    ...extractDrugClassesFromText(questionnaireText),
  ]);

  const addFactor = (factorType, factorLabel, severity, score) => {
    riskFactors.push({
      factorType,
      factorLabel,
      severity,
      score,
    });
    ruleScore += score;
  };

  if (userAllergyEvidence) {
    addFactor('allergy_match', 'This medicine directly matches a known allergy in the profile.', 'high', 80);
  }

  const aspirinSalicylateInProfile =
    includesAnyTerm(knownAllergiesText, ASPIRIN_SALICYLATE_ALLERGY_TERMS) ||
    includesAnyTerm(questionnaireText, ASPIRIN_SALICYLATE_ALLERGY_TERMS);

  if (
    !riskFactors.some((factor) => factor.factorType === 'allergy_match') &&
    medicationFlags.isNsaid &&
    aspirinSalicylateInProfile
  ) {
    addFactor(
      'nsaid_aspirin_cross_allergy',
      'Aspirin/salicylate allergy with another NSAID (e.g. naproxen): high cross-reactivity — treat like a strong class-related allergy risk.',
      'high',
      60
    );
  }

  if (
    currentDrugClassInfo?.drug_class &&
    currentDrugClassInfo.drug_class !== 'unknown' &&
    profileDrugClasses.has(currentDrugClassInfo.drug_class) &&
    !riskFactors.some((factor) => factor.factorType === 'allergy_match')
  ) {
    addFactor(
      'allergy_class_match',
      `This medicine belongs to the same drug class/family (${currentDrugClassInfo.drug_class}) as a previous allergy in the profile or questionnaire.`,
      'high',
      60
    );
  }

  if (payload.hadReactionBefore === true || questionnaireAllergyEvidence) {
    addFactor('past_reaction', 'Past reaction symptom match suggests extra caution.', 'medium', 20);
  }

  if (medicationKnowledge.interactionCount > 0) {
    const severityScore = medicationKnowledge.maxInteractionSeverity === 'high'
      ? 60
      : medicationKnowledge.maxInteractionSeverity === 'medium'
        ? 30
        : 10;

    if (severityScore > 0) {
      addFactor(
        'ddinter_interaction',
        `DDInter-style check found ${medicationKnowledge.interactionCount} possible interaction(s).`,
        medicationKnowledge.maxInteractionSeverity === 'high' ? 'high' : 'medium',
        severityScore
      );
    }
  }

  if (medicationKnowledge.sideEffectMatchCount > 0) {
    addFactor(
      'sider_symptom_match',
      `SIDER-style side-effect matching found ${medicationKnowledge.sideEffectMatchCount} overlap(s) with reported symptoms.`,
      'medium',
      12
    );
  }

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

  if (hasChronicContraindicationRisk({
    chronicDiseasesText,
    therapeuticClass: medicationKnowledge.therapeuticClass || fallbackMedication.therapeuticClass,
    ingredientName: medicationKnowledge.ingredientName || fallbackMedication.ingredientName,
    medicineName: payload.medicineName,
  })) {
    addFactor('chronic_condition', 'Hypertension/chronic condition plus NSAID class may increase medicine risk.', 'medium', 25);
  }

  if (hasDangerousMedicationCombination({
    medicineFlags: medicationFlags,
    currentMedicationsText: profile?.currentMedicationsText,
  })) {
    addFactor(
      'dangerous_combination',
      'A high-risk medicine combination pattern was detected (for example blood thinner with NSAID/antiplatelet, or opioid with sedative).',
      'high',
      32
    );
  }

  if (currentMedicationCount >= 5 || (payload.takingOtherMedicinesNow === true && currentMedicationCount >= 3)) {
    addFactor('polypharmacy_risk', 'Multiple current medicines increase polypharmacy risk.', 'medium', 14);
  }

  if (Number.isFinite(ageValue) && ageValue >= 65) {
    addFactor('elder_risk', 'Elderly age may increase sensitivity to medicine risks and interactions.', 'medium', 10);
  }

  if (medicationKnowledge.matched === false) {
    addFactor(
      'knowledge_gap',
      'This name did not match the local RxNorm/SIDER dictionary well — side effects and interactions may be incomplete until the spelling or strength is corrected.',
      'medium',
      12
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
    addFactor(
      'medicine_history',
      `Your medicine history includes ${historyRows.length} prior check(s) for this drug: ${historyDangerousCount} Dangerous, ${historyWarningCount} Warning, ${historySafeCount} Safe (latest: ${latest?.riskLevel || 'unknown'}).`,
      histSeverity,
      histScore
    );
  }

  const hasDirectAllergyMatch = riskFactors.some((factor) => factor.factorType === 'allergy_match');
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

  if ((hasMediumOrHighInteraction || hasGeneralCautionMedicine || severeReactionSignal) && ruleScore < 25) {
    ruleScore = 25;
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
  const riskScore = ruleScore;
  let riskLevel = 'Safe';

  if (riskScore >= 60) {
    riskLevel = 'Dangerous';
  } else if (riskScore >= 25) {
    riskLevel = 'Warning';
  }

  const explanationParts = riskFactors.slice(0, 3).map((factor) => factor.factorLabel);
  const explanation = explanationParts.length > 0
    ? explanationParts.join(' ')
    : 'No strong warning signs were found in the saved profile, but continue checking carefully.';

  let recommendation = 'Use as directed and keep monitoring for any unusual reaction.';
  if (riskLevel === 'Warning') {
    recommendation = 'Use caution and talk to a pharmacist or caregiver before taking this medicine.';
  }
  if (riskLevel === 'Dangerous') {
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

  const ruleScore = Number(analysisPayload.riskScore || 0);
  const ruleRiskLevel = analysisPayload.riskLevel || 'Safe';
  const mlDangerScore = Number.isFinite(Number(mlPrediction.mlRiskScore))
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
  let combinedRiskScore = Math.round((0.55 * ruleScore) + (0.45 * mlDangerScore));
  if (mlDangerScore >= 50 && ruleScore >= 20) {
    combinedRiskScore = Math.max(combinedRiskScore, Math.round(0.5 * ruleScore + 0.5 * mlDangerScore) + 3);
  }
  let combinedRiskLevel = 'Safe';
  if (combinedRiskScore >= 60) {
    combinedRiskLevel = 'Dangerous';
  } else if (combinedRiskScore >= 25) {
    combinedRiskLevel = 'Warning';
  }

  if (compareRiskLevel(ruleRiskLevel, combinedRiskLevel) > 0) {
    combinedRiskLevel = ruleRiskLevel;
    if (ruleRiskLevel === 'Dangerous') {
      combinedRiskScore = Math.max(combinedRiskScore, 60);
    } else if (ruleRiskLevel === 'Warning') {
      combinedRiskScore = Math.max(combinedRiskScore, 25);
    }
  }

  const hasDirectAllergyFactor = (analysisPayload.riskFactors || []).some((factor) => factor.factorType === 'allergy_match');
  const hasNsaidAspirinCrossFactor = (analysisPayload.riskFactors || []).some(
    (factor) => factor.factorType === 'nsaid_aspirin_cross_allergy'
  );
  const hasDangerousComboFactor = (analysisPayload.riskFactors || []).some((factor) => factor.factorType === 'dangerous_combination');
  const hasHighInteractionFactor = (analysisPayload.riskFactors || []).some(
    (factor) => factor.factorType === 'ddinter_interaction' && factor.severity === 'high'
  );

  // Safety-first rule: ML must not downgrade clearly high-risk clinical triggers.
  if (hasDirectAllergyFactor || hasNsaidAspirinCrossFactor || hasHighInteractionFactor) {
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
  riskFactors.push({
    factorType: 'ml_prediction',
    factorLabel: `Baseline ML model: P(Dangerous) ≈ ${mlDangerScore}/100; predicted class ${mlPrediction.mlRiskLevel || 'n/a'} (confidence ≈ ${mlClassConf}/100).`,
    severity: mlPrediction.mlRiskLevel === 'Dangerous' ? 'high' : mlPrediction.mlRiskLevel === 'Warning' ? 'medium' : 'low',
    score: mlDangerScore,
  });

  let mlExplanation = `Rule score was ${ruleScore}/100. ML dangerous-class probability was ${mlDangerScore}/100 (predicted ${mlPrediction.mlRiskLevel || 'n/a'} with ~${mlClassConf}/100 class confidence). The combined weighted score is ${combinedRiskScore}/100.`;
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
        target: mlPrediction.target,
        probability: mlPrediction.probability,
        probabilityDangerous: mlPrediction.probabilityDangerous,
        probabilityWarning: mlPrediction.probabilityWarning,
        probabilitySafe: mlPrediction.probabilitySafe,
        mlRiskScore: mlDangerScore,
        mlClassConfidenceScore: mlClassConf,
        mlRiskLevel: mlPrediction.mlRiskLevel,
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
      mlScore: mlDangerScore,
      mlClassConfidenceScore: mlClassConf,
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
    const profile = await allergyModel.upsertProfile(req.user.id, sanitizeProfilePayload(req.body));
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

    if (!payload.symptoms) {
      return res.status(400).json({ error: 'symptoms is required' });
    }

    const reaction = await allergyModel.createReactionLog(req.user.id, payload);
    return res.status(201).json({ reaction });
  } catch (error) {
    return next(error);
  }
};

const analyzeMedicine = async (req, res, next) => {
  try {
    const payload = sanitizeAnalysisPayload(req.body);

    if (!payload.medicineName) {
      return res.status(400).json({ error: 'medicineName is required' });
    }

    const prelimDrug = resolveMedication(payload.normalizedDrugName || payload.medicineName);

    const [profile, questionnaireAnswers, medicineHistory] = await Promise.all([
      allergyModel.getProfile(req.user.id),
      allergyModel.listQuestionnaireAnswers(req.user.id),
      allergyModel.listHistoryMatchesForMedicine(req.user.id, {
        normalizedDrugName: prelimDrug.normalizedName,
        rxnormCui: prelimDrug.rxnormCui,
        medicineName: payload.medicineName,
      }),
    ]);

    const ruleAnalysis = buildAnalysis(payload, profile, questionnaireAnswers, medicineHistory);
    const mlPrediction = await predictMedicineRisk({
      analysisPayload: ruleAnalysis,
      profile,
      questionnaireAnswers,
    });
    const analysisPayload = applyMlPrediction(ruleAnalysis, mlPrediction);
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
        mlPrediction,
        dataUsed: analysisPayload.dataUsed,
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
  analyzeMedicine,
};
