const fs = require('fs');
const path = require('path');
const { RXNORM_DRUGS, DDINTER_INTERACTIONS } = require('../data/medicationKnowledge');
const { resolveDrugClass } = require('./drugClassLookupService');
const { canonicalizeDrugName } = require('./drugNormalizationService');

const generatedKnowledgePath = path.resolve(__dirname, '..', 'data', 'generated', 'medicationKnowledge.generated.json');

const dedupeDrugs = (drugs) => {
  const seen = new Set();
  return drugs.filter((drug) => {
    const key = normalizeLookupText(
      drug.normalizedName || drug.displayName || drug.ingredientName || drug.rxnormCui || ''
    );
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const dedupeInteractions = (interactions) => {
  const seen = new Set();
  return interactions.filter((interaction) => {
    const key = [
      normalizeLookupText(interaction.drugA),
      normalizeLookupText(interaction.drugB),
      normalizeText(interaction.severity),
      normalizeText(interaction.description),
    ]
      .sort()
      .join('|');
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const loadKnowledge = () => {
  if (fs.existsSync(generatedKnowledgePath)) {
    try {
      const generated = JSON.parse(fs.readFileSync(generatedKnowledgePath, 'utf8'));
      const generatedDrugs = Array.isArray(generated.drugs) ? generated.drugs : [];
      const generatedInteractions = Array.isArray(generated.interactions) ? generated.interactions : [];
      return {
        drugs: dedupeDrugs([...generatedDrugs, ...RXNORM_DRUGS]),
        interactions: dedupeInteractions([...generatedInteractions, ...DDINTER_INTERACTIONS]),
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

const normalizeText = (value) => (value == null ? '' : String(value).trim().toLowerCase());
const normalizeLookupText = (value) =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const MEDICINE_LINE_PREFIX_PATTERN =
  /^\s*(?:\d+[\).:-]?\s*)?(?:tab(?:let)?|cap(?:sule)?|syp|syrup|inj(?:ection)?|cream|ointment|drops?)\.?\s+/i;

const cleanMedicineCandidate = (value) =>
  normalizeLookupText(
    String(value || '')
      .replace(/^[\s\-_.:,;]+/, ' ')
      .replace(/^\d+\s*[\).:-]?\s*/, ' ')
      .replace(MEDICINE_LINE_PREFIX_PATTERN, ' ')
      .replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, ' ')
      .replace(/\b(?:od|bd|bid|tds|tid|qid|prn|q6h)\b/gi, ' ')
      .replace(/\b(?:once|twice|three|four)\s+daily\b/gi, ' ')
      .replace(/\b(?:after|before|food|breakfast|lunch|dinner|night|morning|evening|bedtime|needed|when|daily)\b/gi, ' ')
  );

const tokenizeMedicineText = (value) =>
  String(value || '')
    .split(/[,/;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const buildLineFragments = (line) => {
  const raw = String(line || '').trim();
  if (!raw) {
    return [];
  }

  const cleaned = cleanMedicineCandidate(raw);
  const normalizedRaw = normalizeLookupText(raw);
  const baseCandidates = Array.from(
    new Set(
      [raw, cleaned, normalizedRaw]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  const words = cleaned.split(' ').filter(Boolean);
  const fragments = [...baseCandidates];

  for (let start = 0; start < words.length; start += 1) {
    for (let size = Math.min(6, words.length - start); size >= 1; size -= 1) {
      const fragment = words.slice(start, start + size).join(' ').trim();
      if (fragment && /[a-z]/i.test(fragment)) {
        fragments.push(fragment);
      }
    }
  }

  return Array.from(new Set(fragments));
};

const knowledge = loadKnowledge();

const buildDrugAliases = (drug) =>
  Array.from(
    new Set(
      [
        drug.displayName,
        drug.normalizedName,
        drug.ingredientName,
        ...(Array.isArray(drug.aliases) ? drug.aliases : []),
      ]
        .map((alias) => String(alias || '').trim())
        .filter(Boolean)
    )
  );

const aliasEntries = knowledge.drugs.flatMap((drug) =>
  buildDrugAliases(drug).map((alias) => ({
    alias,
    aliasNormalized: normalizeLookupText(alias),
    drug,
  }))
);

const exactAliasMap = new Map();
const normalizedAliasMap = new Map();

aliasEntries.forEach((entry) => {
  if (!exactAliasMap.has(entry.alias)) {
    exactAliasMap.set(entry.alias, entry);
  }
  if (entry.aliasNormalized && !normalizedAliasMap.has(entry.aliasNormalized)) {
    normalizedAliasMap.set(entry.aliasNormalized, entry);
  }
});

const levenshteinDistance = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
};

const maxFuzzyDistance = (value) => {
  const length = String(value || '').length;
  if (length <= 4) {
    return 1;
  }
  if (length <= 8) {
    return 2;
  }
  return 3;
};

const commonPrefixLength = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return index;
};

const buildResolvedDrug = (drug, matchDetails = {}) => ({
  ...drug,
  matched: true,
  knowledgeSources: ['RxNorm', 'SIDER'],
  matchType: matchDetails.matchType || 'exact',
  matchedAlias: matchDetails.matchedAlias || drug.displayName,
  matchDistance: Number(matchDetails.matchDistance || 0),
});

const OCR_EXCLUDED_TERMS = [
  'ion',
  'wax',
  'cellulose',
  'alcohol',
  'water',
  'petrolatum',
  'gelatin',
  'flavor',
  'flavour',
  'dioxide',
  'hydroxide',
  'oxide',
  'chloride',
  'sodium',
  'potassium',
  'calcium',
];

const TRUSTED_MEDICINE_ALIASES = {
  panadol: 'acetaminophen',
  paracetamol: 'acetaminophen',
  acetaminophen: 'acetaminophen',
  advil: 'ibuprofen',
  nurofen: 'ibuprofen',
  ibuprofen: 'ibuprofen',
  'vitamin c': 'ascorbic acid',
  'ascorbic acid': 'ascorbic acid',
  'co trimoxazole': 'sulfamethoxazole / trimethoprim',
  'co-trimoxazole': 'sulfamethoxazole / trimethoprim',
  cotrimoxazole: 'sulfamethoxazole / trimethoprim',
  bactrim: 'sulfamethoxazole / trimethoprim',
  sulfatrim: 'sulfamethoxazole / trimethoprim',
  amoxicillin: 'amoxicillin',
  warfarin: 'warfarin',
  metformin: 'metformin',
  cetirizine: 'cetirizine',
};

const buildNormalizationAudit = ({
  inputDrug,
  normalizedDrug,
  normalizationSource,
  normalizationConfidence,
}) => ({
  inputDrug,
  normalizedDrug,
  normalizationSource,
  normalizationConfidence,
});

const looksLikeNonMedicineOcrMatch = (match) => {
  const normalized = normalizeLookupText(
    match?.displayName || match?.ingredientName || match?.normalizedName || ''
  );
  if (!normalized) {
    return true;
  }

  const words = normalized.split(' ').filter(Boolean);
  return words.some((word) => OCR_EXCLUDED_TERMS.includes(word));
};

const looksLikeGenericOcrFragment = (fragment) => {
  const words = normalizeLookupText(fragment).split(' ').filter(Boolean);
  if (!words.length) {
    return true;
  }

  const excludedCount = words.filter((word) => OCR_EXCLUDED_TERMS.includes(word)).length;
  if (words.length === 1) {
    return excludedCount === 1;
  }

  return excludedCount === words.length;
};

const isStrongOcrMatch = (line, fragment, match) => {
  const sourceLine = String(line || '').trim();
  const candidateFragment = normalizeLookupText(fragment);
  const matchedAlias = normalizeLookupText(match?.matchedAlias || '');
  const matchType = String(match?.matchType || '').toLowerCase();

  if (!candidateFragment || !matchedAlias) {
    return false;
  }

  if (looksLikeGenericOcrFragment(candidateFragment)) {
    return false;
  }

  if (looksLikeNonMedicineOcrMatch(match)) {
    return false;
  }

  if (candidateFragment.length < 4 && matchType !== 'exact') {
    return false;
  }

  if (matchType === 'fuzzy') {
    return false;
  }

  if (candidateFragment === matchedAlias) {
    return true;
  }

  if (matchedAlias.includes(candidateFragment) || candidateFragment.includes(matchedAlias)) {
    return matchedAlias.length >= 4;
  }

  const lineWords = normalizeLookupText(sourceLine).split(' ').filter(Boolean);
  const aliasWords = matchedAlias.split(' ').filter(Boolean);

  if (!lineWords.length || !aliasWords.length) {
    return false;
  }

  const overlapCount = aliasWords.filter((word) => lineWords.includes(word)).length;
  return overlapCount >= Math.min(aliasWords.length, 2);
};

const isReasonableFuzzyOcrMatch = (line, fragment, match) => {
  if (looksLikeNonMedicineOcrMatch(match)) {
    return false;
  }

  const sourceLine = normalizeLookupText(line);
  const candidateFragment = normalizeLookupText(fragment);
  const matchedAlias = normalizeLookupText(match?.matchedAlias || match?.displayName || '');
  const matchDistance = Number(match?.matchDistance ?? 99);

  if (!candidateFragment || !matchedAlias) {
    return false;
  }

  if (looksLikeGenericOcrFragment(candidateFragment)) {
    return false;
  }

  if (candidateFragment.length < 5 || matchedAlias.length < 5) {
    return false;
  }

  if (matchDistance > 2) {
    return false;
  }

  if (Math.abs(candidateFragment.length - matchedAlias.length) > 3) {
    return false;
  }

  if (commonPrefixLength(candidateFragment, matchedAlias) < 3) {
    return false;
  }

  const fragmentWords = candidateFragment.split(' ').filter(Boolean);
  const aliasWords = matchedAlias.split(' ').filter(Boolean);
  const lineWords = sourceLine.split(' ').filter(Boolean);
  const sharedWords = aliasWords.filter((word) => fragmentWords.includes(word) || lineWords.includes(word)).length;

  if (fragmentWords.length > 1 && sharedWords === 0) {
    return false;
  }

  return true;
};

const buildPrescriptionCandidate = (match, line, fragment, confidence = 'high') => ({
  medicineName: match.displayName,
  normalizedDrugName: match.normalizedName,
  rxnormCui: match.rxnormCui,
  ingredientName: match.ingredientName,
  therapeuticClass: match.therapeuticClass,
  sourceLine: line,
  matchedAlias: match.matchedAlias,
  matchType: match.matchType,
  matchDistance: match.matchDistance,
  ocrFragment: fragment,
  confidence,
});

const matchMedicationName = (input, options = {}) => {
  const rawInput = String(input || '').trim();
  const normalizedInput = normalizeLookupText(rawInput);
  const cleanedInput = cleanMedicineCandidate(rawInput);
  const lookupInput = cleanedInput || normalizedInput;

  if (!rawInput || !lookupInput) {
    return null;
  }

  const exact = exactAliasMap.get(rawInput);
  if (exact) {
    return buildResolvedDrug(exact.drug, {
      matchType: rawInput === rawInput.toLowerCase() ? 'lowercase' : 'exact',
      matchedAlias: exact.alias,
    });
  }

  const normalized = normalizedAliasMap.get(lookupInput) || normalizedAliasMap.get(normalizedInput);
  if (normalized) {
    return buildResolvedDrug(normalized.drug, { matchType: 'lowercase', matchedAlias: normalized.alias });
  }

  const contains = aliasEntries.find((entry) => {
    if (!entry.aliasNormalized) {
      return false;
    }
    return lookupInput.includes(entry.aliasNormalized) || entry.aliasNormalized.includes(lookupInput);
  });
  if (contains) {
    return buildResolvedDrug(contains.drug, { matchType: 'lowercase', matchedAlias: contains.alias });
  }

  if (options.allowFuzzy === false) {
    return null;
  }

  const firstChar = lookupInput[0];
  const distanceLimit = maxFuzzyDistance(lookupInput);
  let best = null;

  for (const entry of aliasEntries) {
    if (!entry.aliasNormalized) {
      continue;
    }
    if (Math.abs(entry.aliasNormalized.length - lookupInput.length) > distanceLimit) {
      continue;
    }
    if (firstChar && entry.aliasNormalized[0] !== firstChar) {
      continue;
    }

    const distance = levenshteinDistance(lookupInput, entry.aliasNormalized);
    if (distance > distanceLimit) {
      continue;
    }

    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && entry.aliasNormalized.length < best.entry.aliasNormalized.length)
    ) {
      best = { entry, distance };
    }
  }

  if (!best) {
    return null;
  }

  return buildResolvedDrug(best.entry.drug, {
    matchType: 'fuzzy',
    matchedAlias: best.entry.alias,
    matchDistance: best.distance,
  });
};

const findDrugEntry = (input) => {
  return matchMedicationName(input);
};

const buildUnresolvedMedication = (input) => {
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
    matchType: 'none',
    matchedAlias: '',
    matchDistance: null,
    normalizationSource: 'UNRESOLVED_FALLBACK',
    normalizationConfidence: 0,
    normalizationAudit: buildNormalizationAudit({
      inputDrug: fallbackName,
      normalizedDrug: normalizeText(fallbackName),
      normalizationSource: 'UNRESOLVED_FALLBACK',
      normalizationConfidence: 0,
    }),
  };
};

const resolveTrustedAlias = (input) => {
  const cleaned = normalizeLookupText(input);
  if (!cleaned || !TRUSTED_MEDICINE_ALIASES[cleaned]) {
    return null;
  }

  const normalizedName = TRUSTED_MEDICINE_ALIASES[cleaned];
  const trustedMatch = findDrugEntry(normalizedName) || findDrugEntry(input);

  if (trustedMatch) {
    return {
      ...trustedMatch,
      normalizedName,
      ingredientName: trustedMatch.ingredientName || normalizedName,
      canonicalIngredient: normalizedName,
      normalizationSource: 'TRUSTED_ALIAS',
      normalizationConfidence: 1,
      originalInput: String(input || '').trim(),
      knowledgeSources: Array.from(new Set([...(trustedMatch.knowledgeSources || []), 'Trusted Alias'])),
      normalizationAudit: buildNormalizationAudit({
        inputDrug: String(input || '').trim(),
        normalizedDrug: normalizedName,
        normalizationSource: 'TRUSTED_ALIAS',
        normalizationConfidence: 1,
      }),
    };
  }

  return {
    rxnormCui: '',
    displayName: normalizedName,
    normalizedName,
    ingredientName: normalizedName,
    therapeuticClass: '',
    aliases: [String(input || '').trim()],
    sideEffects: [],
    severeSideEffects: [],
    matched: true,
    knowledgeSources: ['Trusted Alias'],
    matchType: 'trusted_alias',
    matchedAlias: String(input || '').trim(),
    matchDistance: 0,
    canonicalIngredient: normalizedName,
    normalizationSource: 'TRUSTED_ALIAS',
    normalizationConfidence: 1,
    originalInput: String(input || '').trim(),
    normalizationAudit: buildNormalizationAudit({
      inputDrug: String(input || '').trim(),
      normalizedDrug: normalizedName,
      normalizationSource: 'TRUSTED_ALIAS',
      normalizationConfidence: 1,
    }),
  };
};

const resolveMedicationSync = (input) => {
  const match = findDrugEntry(input);
  if (!match) {
    return buildUnresolvedMedication(input);
  }

  return match;
};

const resolveMedication = async (input, options = {}) => {
  const rawInput = String(input || '').trim();
  if (!rawInput) {
    return buildUnresolvedMedication(input);
  }

  if (options.useRxNorm === false) {
    return resolveMedicationSync(input);
  }

  const trustedAliasMatch = resolveTrustedAlias(rawInput);
  if (trustedAliasMatch) {
    return trustedAliasMatch;
  }

  const localMatch = findDrugEntry(rawInput);
  const hasStrongLocalMatch =
    localMatch &&
    ['exact', 'lowercase'].includes(String(localMatch.matchType || '').toLowerCase());

  if (hasStrongLocalMatch) {
    return {
      ...localMatch,
      canonicalIngredient: normalizeLookupText(localMatch.ingredientName || localMatch.displayName),
      normalizationSource: 'local',
      normalizationConfidence: 1,
      originalInput: rawInput,
      knowledgeSources: Array.from(new Set([...(localMatch.knowledgeSources || []), 'Local Knowledge'])),
      normalizationAudit: buildNormalizationAudit({
        inputDrug: rawInput,
        normalizedDrug: localMatch.normalizedName,
        normalizationSource: 'LOCAL_EXACT',
        normalizationConfidence: 1,
      }),
    };
  }

  const canonical = await canonicalizeDrugName(rawInput);
  const genericMatch = canonical.ingredientName ? findDrugEntry(canonical.ingredientName) : null;
  const match = genericMatch || localMatch;

  if (!match) {
    if (canonical.ingredientName && canonical.source !== 'empty') {
      return {
        rxnormCui: canonical.ingredientRxcui || canonical.rxcui || '',
        displayName: canonical.ingredientName,
        normalizedName: normalizeLookupText(canonical.ingredientName),
        ingredientName: canonical.ingredientName,
        therapeuticClass: 'RxNorm IN',
        aliases: [],
        sideEffects: [],
        severeSideEffects: [],
        matched: true,
        knowledgeSources: ['RxNorm'],
        matchType: 'rxnorm',
        matchedAlias: canonical.ingredientName,
        matchDistance: 0,
        canonicalIngredient: canonical.ingredientName,
        normalizationSource: canonical.source,
        normalizationConfidence: canonical.source === 'rxnorm' ? 0.9 : 0,
        originalInput: rawInput,
        normalizationAudit: buildNormalizationAudit({
          inputDrug: rawInput,
          normalizedDrug: normalizeLookupText(canonical.ingredientName),
          normalizationSource: canonical.source === 'rxnorm' ? 'RXNORM' : 'UNRESOLVED_FALLBACK',
          normalizationConfidence: canonical.source === 'rxnorm' ? 0.9 : 0,
        }),
      };
    }
    return buildUnresolvedMedication(input);
  }

  const shouldPreferLocalMatch =
    localMatch &&
    (String(localMatch.matchType || '').toLowerCase() === 'lowercase' ||
      String(localMatch.matchType || '').toLowerCase() === 'exact' ||
      !genericMatch);

  const resolved = shouldPreferLocalMatch ? { ...localMatch } : { ...match };

  return {
    ...resolved,
    rxnormCui:
      shouldPreferLocalMatch && resolved.rxnormCui
        ? resolved.rxnormCui
        : (genericMatch && canonical.ingredientRxcui) || canonical.rxcui || resolved.rxnormCui,
    canonicalIngredient:
      shouldPreferLocalMatch
        ? normalizeLookupText(resolved.ingredientName || resolved.displayName)
        : canonical.ingredientName || normalizeLookupText(resolved.ingredientName),
    normalizationSource: shouldPreferLocalMatch ? 'local' : canonical.source,
    normalizationConfidence: shouldPreferLocalMatch ? 1 : canonical.source === 'rxnorm' ? 0.9 : 0,
    originalInput: rawInput,
    knowledgeSources: Array.from(
      new Set([
        ...(resolved.knowledgeSources || []),
        ...(shouldPreferLocalMatch ? ['Local Knowledge'] : []),
        ...(!shouldPreferLocalMatch && genericMatch ? ['RxNorm'] : []),
      ])
    ),
    normalizationAudit: buildNormalizationAudit({
      inputDrug: rawInput,
      normalizedDrug: resolved.normalizedName,
      normalizationSource: shouldPreferLocalMatch ? 'LOCAL_EXACT' : canonical.source === 'rxnorm' ? 'RXNORM' : 'UNRESOLVED_FALLBACK',
      normalizationConfidence: shouldPreferLocalMatch ? 1 : canonical.source === 'rxnorm' ? 0.9 : 0,
    }),
  };
};

const compareSeverity = (left, right) => {
  const weights = { low: 1, medium: 2, high: 3 };
  return (weights[left] || 0) - (weights[right] || 0);
};

const findInteractions = (drugName, currentMedicationText) => {
  const normalizedDrug = normalizeText(drugName);
  const currentMeds = tokenizeMedicineText(currentMedicationText)
    .map((item) => resolveMedicationSync(item))
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

const enrichMedication = async ({ medicineName, currentMedicationsText, symptomMatch }) => {
  const drug = await resolveMedication(medicineName);
  const interactionSummary = findInteractions(drug.normalizedName, currentMedicationsText);
  const sideEffectMatches = findSymptomSideEffectMatches(
    symptomMatch,
    [...drug.sideEffects, ...drug.severeSideEffects]
  );
  const atcRecord = resolveDrugClass(
    drug.normalizedName,
    drug.ingredientName,
    drug.displayName,
    medicineName
  );

  const knowledgeSources = Array.from(
    new Set([
      ...drug.knowledgeSources,
      ...(interactionSummary.interactions.length ? ['DDInter'] : []),
      ...(atcRecord?.atc_code ? ['WHO ATC'] : []),
    ])
  );

  return {
    rxnormCui: drug.rxnormCui,
    rxnormMatchedName: drug.displayName,
    normalizedDrugName: drug.normalizedName,
    ingredientName: drug.ingredientName,
    canonicalIngredient: drug.canonicalIngredient || drug.ingredientName,
    normalizationSource: drug.normalizationSource || null,
    originalMedicineInput: drug.originalInput || medicineName,
    normalizationSource: drug.normalizationSource || null,
    normalizationConfidence:
      typeof drug.normalizationConfidence === 'number' ? drug.normalizationConfidence : null,
    normalizationAudit: drug.normalizationAudit || null,
    therapeuticClass: drug.therapeuticClass,
    matched: drug.matched !== false,
    whoAtc: atcRecord
      ? {
          atcCode: atcRecord.atc_code || '',
          atcGroupCode: atcRecord.atc_group_code || '',
          atcGroupName: atcRecord.atc_group_name || '',
          atcClassLabel: atcRecord.atc_class_label || '',
          drugClass: atcRecord.drug_class || 'unknown',
        }
      : null,
    commonSideEffects: drug.sideEffects,
    severeSideEffects: drug.severeSideEffects,
    sideEffectCount: drug.sideEffects.length,
    severeSideEffectCount: drug.severeSideEffects.length,
    sideEffectMatchCount: sideEffectMatches.length,
    sideEffectMatches,
    interactionCount: interactionSummary.interactionCount,
    maxInteractionSeverity: interactionSummary.maxInteractionSeverity,
    interactions: interactionSummary.interactions,
    knowledgeSources,
  };
};

const searchMedications = (query) => {
  const rawQuery = String(query || '').trim();
  const normalizedQuery = normalizeLookupText(rawQuery);
  if (!normalizedQuery) {
    return [];
  }

  const results = [];
  const seen = new Set();
  const addResult = (drug, extra = {}) => {
    if (!drug) {
      return;
    }
    const key = `${drug.rxnormCui || ''}:${drug.normalizedName || drug.displayName || ''}`.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push({
      rxnormCui: drug.rxnormCui,
      displayName: drug.displayName,
      normalizedName: drug.normalizedName,
      ingredientName: drug.ingredientName,
      therapeuticClass: drug.therapeuticClass,
      source: 'RxNorm',
      ...extra,
    });
  };

  const trustedAlias = TRUSTED_MEDICINE_ALIASES[normalizedQuery];
  if (trustedAlias) {
    const trustedMatch = findDrugEntry(trustedAlias);
    addResult(trustedMatch || {
      rxnormCui: '',
      displayName: rawQuery,
      normalizedName: trustedAlias,
      ingredientName: trustedAlias,
      therapeuticClass: '',
    }, {
      matchType: 'trusted_alias',
      matchedAlias: rawQuery,
      confidence: 1,
    });
  }

  const directMatch = matchMedicationName(rawQuery);
  if (directMatch) {
    addResult(directMatch, {
      matchType: directMatch.matchType || 'exact',
      matchedAlias: directMatch.matchedAlias || rawQuery,
      confidence:
        directMatch.matchType === 'fuzzy'
          ? Math.max(0.55, 1 - ((Number(directMatch.matchDistance || 0) / Math.max(String(directMatch.matchedAlias || '').length, 4))))
          : 0.98,
    });
  }

  aliasEntries.forEach((entry) => {
    if (!entry.aliasNormalized) {
      return;
    }

    const alias = entry.aliasNormalized;
    const includesQuery = alias.includes(normalizedQuery) || normalizedQuery.includes(alias);
    const distance = levenshteinDistance(normalizedQuery, alias);
    const fuzzyLimit = maxFuzzyDistance(normalizedQuery);
    const prefix = commonPrefixLength(normalizedQuery, alias);

    if (!includesQuery && !(distance <= fuzzyLimit && prefix >= 2)) {
      return;
    }

    const isTrustedAlias = TRUSTED_MEDICINE_ALIASES[alias] === entry.drug.normalizedName;
    const matchType = includesQuery
      ? (isTrustedAlias ? 'brand_alias' : 'partial')
      : (isTrustedAlias ? 'fuzzy_brand' : 'fuzzy');

    const confidence = includesQuery
      ? Math.min(0.96, Math.max(0.72, normalizedQuery.length / Math.max(alias.length, 1)))
      : Math.max(0.5, 1 - (distance / Math.max(alias.length, 4)));

    addResult(entry.drug, {
      matchType,
      matchedAlias: entry.alias,
      confidence: Number(confidence.toFixed(2)),
    });
  });

  return results
    .sort((left, right) => {
      const confidenceDiff = Number(right.confidence || 0) - Number(left.confidence || 0);
      if (confidenceDiff !== 0) {
        return confidenceDiff;
      }
      return String(left.displayName || '').localeCompare(String(right.displayName || ''));
    })
    .slice(0, 10);
};

const matchMedicinesFromText = (rawText) => {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set();
  const results = [];

  lines.forEach((line) => {
    const fragments = buildLineFragments(line);
    let matchedThisLine = false;

    for (const fragment of fragments) {
      const match = matchMedicationName(fragment, { allowFuzzy: false });
      if (!match) {
        continue;
      }
      if (!isStrongOcrMatch(line, fragment, match)) {
        continue;
      }

      const key = `${match.normalizedName}:${line.toLowerCase()}`;
      if (seen.has(key)) {
        matchedThisLine = true;
        break;
      }
      seen.add(key);

      results.push(buildPrescriptionCandidate(match, line, fragment, 'high'));
      matchedThisLine = true;
      break;
    }

    if (matchedThisLine) {
      return;
    }

    let bestCorrection = null;

    for (const fragment of fragments) {
      const match = matchMedicationName(fragment);
      if (!match || match.matchType !== 'fuzzy') {
        continue;
      }
      if (!isReasonableFuzzyOcrMatch(line, fragment, match)) {
        continue;
      }

      const prefix = commonPrefixLength(
        normalizeLookupText(fragment),
        normalizeLookupText(match.matchedAlias || match.displayName || '')
      );
      const score = (prefix * 10) - (Number(match.matchDistance || 0) * 20);

      if (!bestCorrection || score > bestCorrection.score) {
        bestCorrection = { match, fragment, score };
      }
    }

    if (!bestCorrection) {
      return;
    }

    const key = `${bestCorrection.match.normalizedName}:${line.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(buildPrescriptionCandidate(bestCorrection.match, line, bestCorrection.fragment, 'medium'));
  });

  return results.slice(0, 8);
};

module.exports = {
  resolveMedication,
  resolveMedicationSync,
  enrichMedication,
  searchMedications,
  matchMedicinesFromText,
};
