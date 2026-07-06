const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '..', '..', 'ml', 'data', 'drug_class_dataset.json');

const CLASS_ALIAS_MAP = {
  penicillin: ['penicillin', 'penicillin antibiotic', 'beta-lactam', 'beta lactam'],
  cephalosporin: ['cephalosporin', 'cephalosporins'],
  macrolide: ['macrolide', 'macrolide antibiotic'],
  fluoroquinolone: ['fluoroquinolone', 'quinolone antibiotic', 'quinolone'],
  sulfonamide: ['sulfonamide', 'sulfa', 'sulfa drug', 'sulfa drugs'],
  nsaid: ['nsaid', 'nonsteroidal anti-inflammatory', 'non steroidal anti inflammatory'],
  anticoagulant: ['anticoagulant', 'blood thinner'],
  antiplatelet: ['antiplatelet'],
  opioid: ['opioid', 'opioid analgesic'],
  benzodiazepine: ['benzodiazepine'],
  antihistamine: ['antihistamine'],
  arb: ['arb', 'angiotensin receptor blocker'],
  ace_inhibitor: ['ace inhibitor', 'angiotensin converting enzyme inhibitor'],
  beta_blocker: ['beta blocker', 'beta-blocker'],
  statin: ['statin'],
  biguanide: ['biguanide'],
  sulfonylurea: ['sulfonylurea'],
};

let cachedLookup = null;

const normalizeDrugName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml|tablet|capsule)\b/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9,\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const loadLookup = () => {
  if (cachedLookup) {
    return cachedLookup;
  }

  const empty = {
    recordsByName: new Map(),
    classAliases: CLASS_ALIAS_MAP,
  };

  if (!fs.existsSync(dataPath)) {
    cachedLookup = empty;
    return cachedLookup;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const records = Array.isArray(parsed.records) ? parsed.records : [];
    const recordsByName = new Map();

    for (const record of records) {
      const normalizedName = normalizeDrugName(record.normalized_name || record.drug_name || record.ingredient_name);
      if (!normalizedName || recordsByName.has(normalizedName)) {
        continue;
      }
      recordsByName.set(normalizedName, record);
    }

    cachedLookup = {
      recordsByName,
      classAliases: CLASS_ALIAS_MAP,
    };
    return cachedLookup;
  } catch {
    cachedLookup = empty;
    return cachedLookup;
  }
};

const resolveDrugClass = (...values) => {
  const { recordsByName } = loadLookup();

  for (const value of values) {
    const normalized = normalizeDrugName(value);
    if (!normalized) {
      continue;
    }

    if (recordsByName.has(normalized)) {
      return recordsByName.get(normalized);
    }
  }

  return null;
};

const getDrugClassTerms = (record) => {
  if (!record) {
    return [];
  }

  const terms = new Set();
  if (record.drug_class && record.drug_class !== 'unknown') {
    terms.add(record.drug_class);
    (CLASS_ALIAS_MAP[record.drug_class] || []).forEach((alias) => terms.add(alias));
  }
  if (record.atc_class_label) {
    terms.add(String(record.atc_class_label).toLowerCase());
  }
  if (record.atc_group_name) {
    terms.add(String(record.atc_group_name).toLowerCase());
  }
  return Array.from(terms).filter(Boolean);
};

const extractDrugClassesFromText = (text) => {
  const normalizedText = normalizeDrugName(text);
  if (!normalizedText) {
    return [];
  }

  const { classAliases } = loadLookup();
  const detected = new Set();
  const segments = normalizedText
    .split(/[,;/\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const record = resolveDrugClass(segment);
    if (record?.drug_class && record.drug_class !== 'unknown') {
      detected.add(record.drug_class);
    }
  }

  for (const [drugClass, aliases] of Object.entries(classAliases)) {
    if (aliases.some((alias) => normalizedText.includes(alias))) {
      detected.add(drugClass);
    }
  }

  return Array.from(detected);
};

module.exports = {
  normalizeDrugName,
  resolveDrugClass,
  getDrugClassTerms,
  extractDrugClassesFromText,
};
