const { matchMedicationName, resolveMedication } = require('./medicationKnowledgeService');
const { resolveDrugClass } = require('./drugClassLookupService');

/**
 * Documents Objective 1 pipeline stages for API audit / dissertation evidence.
 */
const buildPipelineReport = ({
  inputMethod = 'manual',
  rawInput = '',
  medicineName = '',
  normalizedDrugName = '',
  medicationKnowledge = {},
}) => {
  const resolved = resolveMedication(medicineName || normalizedDrugName);
  const atcRecord = resolveDrugClass(
    normalizedDrugName || resolved.normalizedName,
    medicationKnowledge.ingredientName || resolved.ingredientName,
    medicineName
  );

  const knowledgeSources = Array.from(
    new Set([
      ...(medicationKnowledge.knowledgeSources || []),
      ...(atcRecord?.atc_code ? ['WHO ATC'] : []),
    ])
  );

  return {
    objective: 'O1_data_pipeline',
    inputModality: inputMethod,
    stages: [
      {
        id: 'capture',
        label: 'Medicine input capture',
        status: 'complete',
        detail:
          inputMethod === 'scan'
            ? 'Prescription image uploaded; OCR preprocessing applied server-side.'
            : inputMethod === 'voice'
              ? 'Voice/speech text captured and normalized client-side.'
              : 'Manual typed medicine entry.',
      },
      {
        id: 'ocr_nlp',
        label: 'OCR & text extraction',
        status: inputMethod === 'scan' ? 'complete' : 'skipped',
        detail:
          inputMethod === 'scan'
            ? 'Tesseract OCR + post-correction (character fixes, drug token repair).'
            : 'Not required for non-scan input.',
      },
      {
        id: 'segmentation',
        label: 'Dose / frequency parsing',
        status: rawInput ? 'complete' : 'optional',
        detail: 'Client parses medicine name, dose, and frequency from raw text where available.',
      },
      {
        id: 'rxnorm_normalize',
        label: 'RxNorm-style normalization',
        status: resolved.matched !== false ? 'complete' : 'review_required',
        detail: {
          medicineName,
          normalizedDrugName: normalizedDrugName || resolved.normalizedName,
          rxnormCui: medicationKnowledge.rxnormCui || resolved.rxnormCui,
          matchType: resolved.matchType || 'unknown',
          confidence:
            resolved.matchType === 'exact' || resolved.matchType === 'lowercase'
              ? 'high'
              : resolved.matchType === 'fuzzy'
                ? 'medium'
                : 'low',
        },
      },
      {
        id: 'who_atc',
        label: 'WHO ATC class assignment',
        status: atcRecord?.atc_code ? 'complete' : 'partial',
        detail: atcRecord
          ? {
              atcCode: atcRecord.atc_code,
              atcGroupCode: atcRecord.atc_group_code,
              atcGroupName: atcRecord.atc_group_name,
              drugClass: atcRecord.drug_class,
            }
          : 'ATC lookup unavailable for this spelling; class rules use therapeutic text fallback.',
      },
      {
        id: 'knowledge_query',
        label: 'Pharmacological knowledge query',
        status: knowledgeSources.length > 0 ? 'complete' : 'partial',
        detail: {
          sourcesQueried: knowledgeSources.length ? knowledgeSources : ['RxNorm'],
          sideEffectCount: medicationKnowledge.sideEffectCount || 0,
          interactionCount: medicationKnowledge.interactionCount || 0,
        },
      },
    ],
    outputs: {
      canonicalMedicineName: medicationKnowledge.rxnormMatchedName || resolved.displayName || medicineName,
      normalizedDrugName: normalizedDrugName || resolved.normalizedName,
      knowledgeSources,
    },
  };
};

const normalizeMedicineInput = (payload) => {
  const medicineName = String(payload.medicineName || '').trim();
  const match = matchMedicationName(medicineName, { allowFuzzy: true });
  return {
    medicineName,
    normalizedDrugName: match?.normalizedName || medicineName.toLowerCase(),
    rxnormCui: match?.rxnormCui || '',
    ingredientName: match?.ingredientName || '',
    therapeuticClass: match?.therapeuticClass || '',
    matchType: match?.matchType || 'none',
  };
};

module.exports = {
  buildPipelineReport,
  normalizeMedicineInput,
};
