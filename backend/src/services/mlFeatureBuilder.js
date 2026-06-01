const {
  resolveDrugClass,
  extractDrugClassesFromText,
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

const allergySeverityFromContext = ({ profile, questionnaireAnswers, sameClassAllergy, severeSideEffectCount }) => {
  const answerMap = (questionnaireAnswers || []).reduce((acc, item) => {
    acc[item.questionKey] = item.answerText;
    return acc;
  }, {});

  let score = 0;
  if (profile?.hasMedicineAllergy === true || normalizeText(profile?.hasMedicineAllergy) === 'true') {
    score = Math.max(score, 1);
  }
  if (sameClassAllergy) {
    score = Math.max(score, 2);
  }
  if (normalizeText(answerMap.pastReaction) === 'yes') {
    score = Math.max(score, 2);
  }
  if (Number(severeSideEffectCount || 0) >= 2) {
    score = Math.max(score, 3);
  }
  return score;
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
  const profileDrugClasses = new Set([
    ...extractDrugClassesFromText(profile?.knownAllergiesText),
    ...extractDrugClassesFromText(answerMap.medicineName || ''),
  ]);
  const sameClassAllergy = profileDrugClasses.has(drugClassInfo?.drug_class || '') ? 1 : 0;
  const chronic = chronicFlagsFromText(profile?.chronicDiseasesText);
  const drugFlags = drugFlagsFromNames(
    analysisPayload.normalizedDrugName,
    analysisPayload.ingredientName,
    analysisPayload.medicineName
  );

  return {
    patient_age: Number(profile?.age || 0),
    patient_sex: encodePatientSex(profile?.gender),
    num_current_meds: countTextItems(profile?.currentMedicationsText),
    ...chronic,
    allergy_severity_max: allergySeverityFromContext({
      profile,
      questionnaireAnswers,
      sameClassAllergy,
      severeSideEffectCount: analysisPayload.severeSideEffectCount,
    }),
    allergy_class_overlap: sameClassAllergy,
    ddi_severity_max: ddiSeverityToOrdinal(analysisPayload.maxInteractionSeverity),
    ddi_pair_count: Number(analysisPayload.interactionCount || 0),
    sider_adr_count: Number(analysisPayload.sideEffectCount || 0),
    ...drugFlags,
    atc_class_encoded: encodeAtcClass(
      drugClassInfo?.atc_code,
      analysisPayload.normalizedDrugName,
      analysisPayload.ingredientName,
      analysisPayload.medicineName
    ),
  };
};

module.exports = {
  buildMlFeaturePayload,
};
