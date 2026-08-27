const {
  resolveDrugClass,
} = require('./drugClassLookupService');

const NTI_TERMS = [
  'warfarin',
  'digoxin',
  'lithium',
  'phenytoin',
  'theophylline',
  'levothyroxine',
  'methotrexate',
  'cyclosporine',
];
const RENAL_EXCRETION_TERMS = ['metformin', 'digoxin', 'lithium', 'atenolol', 'nitrofurantoin', 'allopurinol'];
const HEPATIC_METABOLISM_TERMS = [
  'warfarin',
  'statins',
  'atorvastatin',
  'simvastatin',
  'carbamazepine',
  'phenytoin',
  'paracetamol',
  'acetaminophen',
];

const normalizeText = (value) => (value == null ? '' : String(value).trim().toLowerCase());

const countTextItems = (value) => {
  const text = normalizeText(value);
  if (!text || ['none', 'no', 'n/a', 'na', 'nil'].includes(text)) {
    return 0;
  }
  return text
    .replace(/;/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean).length;
};

const chronicFlagsFromText = (text) => {
  const normalized = normalizeText(text);
  return {
    has_renal_disease: ['kidney', 'renal', 'ckd', 'dialysis', 'nephro'].some((term) => normalized.includes(term)) ? 1 : 0,
    has_hepatic_disease: ['liver', 'hepatic', 'cirrhosis', 'jaundice'].some((term) => normalized.includes(term)) ? 1 : 0,
    has_diabetes: ['diabetes', 'diabetic'].some((term) => normalized.includes(term)) ? 1 : 0,
    has_cardiovascular: ['hypertension', 'heart', 'cardiac', 'cardiovascular', 'stroke', 'coronary'].some((term) =>
      normalized.includes(term)
    )
      ? 1
      : 0,
    has_epilepsy: ['epilepsy', 'seizure', 'convulsion'].some((term) => normalized.includes(term)) ? 1 : 0,
  };
};

const drugFlagsFromNames = (...values) => {
  const combined = values.map((value) => normalizeText(value)).join(' ');
  return {
    drug_hepatic_metabolism: HEPATIC_METABOLISM_TERMS.some((term) => combined.includes(term)) ? 1 : 0,
    drug_renal_excretion: RENAL_EXCRETION_TERMS.some((term) => combined.includes(term)) ? 1 : 0,
    nti_drug_flag: NTI_TERMS.some((term) => combined.includes(term)) ? 1 : 0,
  };
};

const encodePatientSex = (value) => {
  const text = normalizeText(value);
  if (['m', 'male', '1'].includes(text)) {
    return 'male';
  }
  if (['f', 'female', '2'].includes(text)) {
    return 'female';
  }
  return 'unknown';
};

const ddiSeverityToOrdinal = (value) => {
  const text = normalizeText(value);
  const mapping = {
    none: 0,
    low: 1,
    minor: 1,
    medium: 2,
    moderate: 2,
    high: 3,
    major: 3,
    severe: 3,
  };
  if (/^\d+$/.test(text)) {
    return Math.max(0, Math.min(3, Number(text)));
  }
  return mapping[text] ?? 0;
};

const encodeAtcClass = (...values) => {
  for (const value of values) {
    const text = String(value || '').trim().toUpperCase();
    if (text && /^[A-V]/.test(text)) {
      return text[0];
    }
  }

  for (const value of values) {
    const record = resolveDrugClass(value);
    const atcCode = String(record?.atc_code || '').trim().toUpperCase();
    if (atcCode && /^[A-V]/.test(atcCode)) {
      return atcCode[0];
    }
  }
  return 'unknown';
};

const buildMlFeaturePayload = ({ analysisPayload, profile, questionnaireAnswers }) => {
  const answerMap = (questionnaireAnswers || []).reduce((acc, item) => {
    acc[item.questionKey] = item.answerText;
    return acc;
  }, {});

  const drugClassInfo = resolveDrugClass(
    analysisPayload.normalizedDrugName,
    analysisPayload.medicineName,
    analysisPayload.ingredientName,
    analysisPayload.medicationKnowledge?.rxnormMatchedName
  );
  const chronic = chronicFlagsFromText(profile?.chronicDiseasesText);
  const baseDrugFlags = drugFlagsFromNames(
    analysisPayload.normalizedDrugName,
    analysisPayload.ingredientName,
    analysisPayload.medicineName
  );
  const drugFlags = {
    ...baseDrugFlags,
    // Runtime ML should not inflate risk from a generic metabolism route alone.
    // Only keep these organ-clearance flags when the patient also has matching organ disease.
    drug_hepatic_metabolism: baseDrugFlags.drug_hepatic_metabolism && chronic.has_hepatic_disease ? 1 : 0,
    drug_renal_excretion: baseDrugFlags.drug_renal_excretion && chronic.has_renal_disease ? 1 : 0,
  };
  // Keep direct allergy-history / cross-reactivity evidence on the clinical-rule side.
  // The current FAERS-trained ML model does not have a trustworthy independent patient-allergy
  // history signal, so feeding these rule-shaped features into runtime ML can create large,
  // misleading disagreement between ruleScore and mlRiskScore.
  const neutralAllergyFeatures = {
    allergy_severity_max: 0,
    allergy_class_overlap: 0,
  };

  return {
    patient_age: Number(profile?.age || 0),
    patient_sex: encodePatientSex(profile?.gender),
    num_current_meds: countTextItems(profile?.currentMedicationsText),
    ...chronic,
    ...neutralAllergyFeatures,
    ddi_severity_max: ddiSeverityToOrdinal(analysisPayload.maxInteractionSeverity),
    ddi_pair_count: Number(analysisPayload.interactionCount || 0),
    ddi_flag: Number(analysisPayload.interactionCount || 0) > 0 ? 1 : 0,
    sider_adr_count: Number(analysisPayload.sideEffectCount || 0),
    ...drugFlags,
    rxnorm_matched: analysisPayload.medicationKnowledge?.matched === false ? 0 : 1,
    atc_class_encoded: encodeAtcClass(
      drugClassInfo?.atc_code,
      analysisPayload.normalizedDrugName,
      analysisPayload.ingredientName,
      analysisPayload.medicineName
    ),
  };
};

const countReactionItems = (value) => {
  const text = normalizeText(value);
  if (!text || ['none', 'no', 'n/a', 'na', 'nil', 'unknown'].includes(text)) {
    return 0;
  }
  return text
    .replace(/[;/|]+/g, ',')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean).length;
};

const normalizePatientSex = (value) => {
  const text = normalizeText(value);
  if (['m', 'male'].includes(text)) {
    return 'Male';
  }
  if (['f', 'female'].includes(text)) {
    return 'Female';
  }
  return 'Unknown';
};

const getQuestionnaireMap = (questionnaireAnswers = []) =>
  (questionnaireAnswers || []).reduce((acc, item) => {
    acc[item.questionKey] = item.answerText;
    return acc;
  }, {});

const cleanReactionText = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const [base] = text.split(': ');
  return String(base || '').trim();
};

const getCurrentMedicineReactionSignal = ({ analysisPayload, profile, questionMap }) => {
  const sideEffectMatch = analysisPayload?.medicationKnowledge?.sideEffectMatches?.[0];
  if (sideEffectMatch) {
    return cleanReactionText(sideEffectMatch);
  }

  const symptomMatch = cleanReactionText(analysisPayload?.symptomMatch);
  if (symptomMatch) {
    return symptomMatch;
  }

  if (analysisPayload?.hadReactionBefore === true) {
    const notesSignal = cleanReactionText(analysisPayload?.notes);
    if (notesSignal) {
      return notesSignal;
    }
  }

  const medicineNameAnswer = normalizeText(questionMap?.medicineName);
  const currentMedicine = normalizeText(analysisPayload?.medicineName);
  const questionnaireReaction = cleanReactionText(questionMap?.reactionSymptoms);
  if (
    questionnaireReaction &&
    medicineNameAnswer &&
    currentMedicine &&
    medicineNameAnswer.includes(currentMedicine)
  ) {
    return questionnaireReaction;
  }

  return '';
};

const buildFdaSeriousFeaturePayload = ({ analysisPayload, profile, questionnaireAnswers }) => {
  const questionMap = getQuestionnaireMap(questionnaireAnswers);
  const now = new Date();
  const currentReactionText = getCurrentMedicineReactionSignal({
    analysisPayload,
    profile,
    questionMap,
  });
  const reactionText = currentReactionText || 'Unknown';
  const numReactions = currentReactionText
    ? Math.max(
        Number(analysisPayload?.sideEffectMatchCount || 0),
        countReactionItems(currentReactionText),
        1
      )
    : 0;
  const numCurrentMeds = countTextItems(profile?.currentMedicationsText);

  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    primary_reaction: reactionText || 'Unknown',
    num_reactions: numReactions || 0,
    suspect_drug:
      analysisPayload?.normalizedDrugName ||
      analysisPayload?.ingredientName ||
      analysisPayload?.medicineName ||
      'Unknown',
    drug_route: 'Unknown',
    drug_indication: profile?.chronicDiseasesText || 'Unknown',
    pharm_class:
      analysisPayload?.therapeuticClass ||
      analysisPayload?.dataUsed?.derivedDrugClass ||
      analysisPayload?.medicationKnowledge?.therapeuticClass ||
      'Unknown',
    num_drugs: Math.max(1, numCurrentMeds + 1),
    patient_age_years: Number(profile?.age || 0),
    patient_sex: normalizePatientSex(profile?.gender),
    country: 'Unknown',
    report_age_days: 0,
  };
};

module.exports = {
  buildMlFeaturePayload,
  buildFdaSeriousFeaturePayload,
};
