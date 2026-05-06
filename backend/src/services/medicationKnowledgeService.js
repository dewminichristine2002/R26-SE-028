const fs = require('fs');
const path = require('path');
const { RXNORM_DRUGS, DDINTER_INTERACTIONS } = require('../data/medicationKnowledge');

const generatedKnowledgePath = path.resolve(__dirname, '..', 'data', 'generated', 'medicationKnowledge.generated.json');

const loadKnowledge = () => {
  if (fs.existsSync(generatedKnowledgePath)) {
    try {
      const generated = JSON.parse(fs.readFileSync(generatedKnowledgePath, 'utf8'));
      return {
        drugs: Array.isArray(generated.drugs) ? generated.drugs : RXNORM_DRUGS,
        interactions: Array.isArray(generated.interactions) ? generated.interactions : DDINTER_INTERACTIONS,
      };
    } catch (error) {
      console.warn('[Knowledge] Failed to load generated medication knowledge, using fallback data:', error.message);
    }
  }

  return {
    drugs: RXNORM_DRUGS,
    interactions: DDINTER_INTERACTIONS,
  };
};

const knowledge = loadKnowledge();

const normalizeText = (value) => (value == null ? '' : String(value).trim().toLowerCase());

const tokenizeMedicineText = (value) =>
  String(value || '')
    .split(/[,/;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const findDrugEntry = (input) => {
  const normalizedInput = normalizeText(input);
  if (!normalizedInput) {
    return null;
  }

  return (
    knowledge.drugs.find((drug) =>
      drug.aliases.some((alias) => normalizedInput === normalizeText(alias) || normalizedInput.includes(normalizeText(alias)))
    ) || null
  );
};

const resolveMedication = (input) => {
  const match = findDrugEntry(input);
  if (!match) {
    const fallbackName = String(input || '').trim();
    return {
      rxnormCui: '',
      displayName: fallbackName,
      normalizedName: normalizeText(fallbackName),
      ingredientName: fallbackName,
      therapeuticClass: '',
      aliases: [],
      sideEffects: [],
      severeSideEffects: [],
      matched: false,
      knowledgeSources: [],
    };
  }

  return {
    ...match,
    matched: true,
    knowledgeSources: ['RxNorm', 'SIDER'],
  };
};

const compareSeverity = (left, right) => {
  const weights = { low: 1, medium: 2, high: 3 };
  return (weights[left] || 0) - (weights[right] || 0);
};

const findInteractions = (drugName, currentMedicationText) => {
  const normalizedDrug = normalizeText(drugName);
  const currentMeds = tokenizeMedicineText(currentMedicationText)
    .map((item) => resolveMedication(item))
    .filter((item) => item.normalizedName);

  const interactions = [];
  for (const currentMed of currentMeds) {
    const match = knowledge.interactions.find(({ drugA, drugB }) => {
      const a = normalizeText(drugA);
      const b = normalizeText(drugB);
      return (
        (normalizedDrug === a && currentMed.normalizedName === b) ||
        (normalizedDrug === b && currentMed.normalizedName === a)
      );
    });

    if (match) {
      interactions.push({
        interactingDrug: currentMed.displayName,
        interactingNormalizedDrug: currentMed.normalizedName,
        severity: match.severity,
        description: match.description,
        source: 'DDInter',
      });
    }
  }

  const maxInteractionSeverity = interactions.reduce(
    (max, item) => (compareSeverity(item.severity, max) > 0 ? item.severity : max),
    'none'
  );

  return {
    interactions,
    interactionCount: interactions.length,
    maxInteractionSeverity,
  };
};

const findSymptomSideEffectMatches = (symptomText, sideEffects) => {
  const normalizedSymptoms = normalizeText(symptomText);
  if (!normalizedSymptoms) {
    return [];
  }

  return sideEffects.filter((effect) => normalizedSymptoms.includes(normalizeText(effect)));
};

const enrichMedication = ({ medicineName, currentMedicationsText, symptomMatch }) => {
  const drug = resolveMedication(medicineName);
  const interactionSummary = findInteractions(drug.normalizedName, currentMedicationsText);
  const sideEffectMatches = findSymptomSideEffectMatches(
    symptomMatch,
    [...drug.sideEffects, ...drug.severeSideEffects]
  );

  return {
    rxnormCui: drug.rxnormCui,
    rxnormMatchedName: drug.displayName,
    normalizedDrugName: drug.normalizedName,
    ingredientName: drug.ingredientName,
    therapeuticClass: drug.therapeuticClass,
    matched: drug.matched !== false,
    commonSideEffects: drug.sideEffects,
    severeSideEffects: drug.severeSideEffects,
    sideEffectCount: drug.sideEffects.length,
    severeSideEffectCount: drug.severeSideEffects.length,
    sideEffectMatchCount: sideEffectMatches.length,
    sideEffectMatches,
    interactionCount: interactionSummary.interactionCount,
    maxInteractionSeverity: interactionSummary.maxInteractionSeverity,
    interactions: interactionSummary.interactions,
    knowledgeSources: Array.from(
      new Set([
        ...drug.knowledgeSources,
        ...(interactionSummary.interactions.length ? ['DDInter'] : []),
      ])
    ),
  };
};

const searchMedications = (query) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return [];
  }

  return knowledge.drugs.filter((drug) =>
    drug.aliases.some((alias) => normalizeText(alias).includes(normalizedQuery))
  ).map((drug) => ({
    rxnormCui: drug.rxnormCui,
    displayName: drug.displayName,
    normalizedName: drug.normalizedName,
    ingredientName: drug.ingredientName,
    therapeuticClass: drug.therapeuticClass,
    source: 'RxNorm',
  }));
};

module.exports = {
  resolveMedication,
  enrichMedication,
  searchMedications,
};
