const { matchMedicationName, resolveMedication } = require('./medicationKnowledgeService');
const { resolveDrugClass } = require('./drugClassLookupService');

/**
 * Documents Objective 1 pipeline stages for API audit / dissertation evidence.
 */
const buildPipelineReport = async ({
  inputMethod = 'manual',
  rawInput = '',
  medicineName = '',
  normalizedDrugName = '',
  medicationKnowledge = {},
}) => {
  const resolved = await resolveMedication(medicineName || normalizedDrugName);
  const interactions = Array.isArray(medicationKnowledge?.interactions)
    ? medicationKnowledge.interactions
    : [];
  const interactionCount = interactions.length;
  const maxInteractionSeverity = interactions.some((item) => item?.severity === 'high')
    ? 'high'
    : interactions.some((item) => item?.severity === 'medium')
      ? 'medium'
      : interactions.some((item) => item?.severity === 'low')
        ? 'low'
        : 'none';
  const effectiveNormalizedDrugName =
    medicationKnowledge.normalizedDrugName || normalizedDrugName || resolved.normalizedName;
  const effectiveNormalizationSource =
    medicationKnowledge.normalizationSource ||
    resolved.normalizationSource ||
    (resolved.matched ? 'LOCAL_EXACT' : 'UNRESOLVED_FALLBACK');
  const effectiveNormalizationConfidence =
    typeof medicationKnowledge.normalizationConfidence === 'number'
      ? medicationKnowledge.normalizationConfidence
      : typeof resolved.normalizationConfidence === 'number'
        ? resolved.normalizationConfidence
        : 0;
  const effectiveNormalizationAudit =
    medicationKnowledge.normalizationAudit || resolved.normalizationAudit || null;
  const atcRecord = resolveDrugClass(
    effectiveNormalizedDrugName,
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
          normalizedDrugName: effectiveNormalizedDrugName,
          rxnormCui: medicationKnowledge.rxnormCui || resolved.rxnormCui,
          matchType: medicationKnowledge.matchType || resolved.matchType || 'unknown',
          normalizationSource: effectiveNormalizationSource,
          normalizationConfidence: effectiveNormalizationConfidence,
          normalizationAudit: effectiveNormalizationAudit,
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
          sideEffectCount: Array.isArray(medicationKnowledge.sideEffectMatches)
            ? medicationKnowledge.sideEffectMatches.length
            : medicationKnowledge.sideEffectCount || 0,
          interactionCount,
          maxInteractionSeverity,
        },
      },
    ],
    outputs: {
      canonicalMedicineName: medicationKnowledge.rxnormMatchedName || resolved.displayName || medicineName,
      normalizedDrugName: effectiveNormalizedDrugName,
      normalizationSource: effectiveNormalizationSource,
      normalizationConfidence: effectiveNormalizationConfidence,
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
