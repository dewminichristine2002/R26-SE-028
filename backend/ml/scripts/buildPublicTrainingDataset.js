/**
 * Builds medicine_safety_training_dataset from:
 *  - Real rows exported from the DB (medicine_safety_dataset.json)
 *  - DDInter interaction pairs (public) with profile templates
 *
 * Env:
 *  MED_DATASET_ROOT = folder with ddinter_downloads_code_*.csv (default: same as buildMedicationKnowledge)
 *  ML_PUBLIC_SAMPLE = max DDInter-based rows (default: 4000)
 *  ML_SEED_SUPPLEMENT = extra rule-based seed rows from generateSeedDataset logic (default: 0)
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseCsvLine } = require('../../scripts/csvLine');

const dataDir = path.resolve(__dirname, '..', 'data');
const realJsonPath = path.join(dataDir, 'medicine_safety_dataset.json');
const realCsvPath = path.join(dataDir, 'medicine_safety_dataset.csv');
const trainingJsonPath = path.join(dataDir, 'medicine_safety_training_dataset.json');
const trainingCsvPath = path.join(dataDir, 'medicine_safety_training_dataset.csv');

const defaultDatasetRoot = 'C:\\Users\\thyag\\OneDrive\\Desktop\\Y4S1\\Research\\Datasets';
const datasetRoot = process.env.MED_DATASET_ROOT || defaultDatasetRoot;
const maxPublicRows = Math.max(50, Number(process.env.ML_PUBLIC_SAMPLE || 4000));
const seedSupplement = Math.max(0, Number(process.env.ML_SEED_SUPPLEMENT || 0));

const normalizeText = (value) => (value == null ? '' : String(value).trim().toLowerCase());
const normalizeDrugName = (value) =>
  normalizeText(value)
    .replace(/\b\d+(\.\d+)?\s*(mg|mcg|g|ml)\b/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const profileCatalog = [
  {
    age: 72,
    gender: 'Female',
    known_allergies_text: 'Penicillin, Sulfa drugs',
    chronic_diseases_text: 'Type 2 Diabetes, Hypertension',
    current_medications_text: 'Metformin, Losartan',
    emergency_contact: 'Nimal Perera - Son - +94 77 123 4567',
    caregiver_details: 'Shanthi Silva - Home caregiver',
    has_medicine_allergy: true,
    q_past_reaction: 'Yes',
    q_reaction_symptoms: 'Skin rash',
    q_medicine_name: 'Yes: Penicillin',
    q_doctor_advice: 'Yes: Avoid penicillin antibiotics',
    q_antibiotic_painkiller_reaction: 'Yes',
  },
  {
    age: 68,
    gender: 'Male',
    known_allergies_text: 'Aspirin',
    chronic_diseases_text: 'Hypertension, Chronic kidney disease',
    current_medications_text: 'Amlodipine, Metformin',
    emergency_contact: 'Kamal Jayasinghe - Daughter - +94 71 987 6543',
    caregiver_details: 'Dr. Perera Clinic - Monthly follow-up',
    has_medicine_allergy: true,
    q_past_reaction: 'Yes',
    q_reaction_symptoms: 'Breathing trouble',
    q_medicine_name: 'Yes: Aspirin',
    q_doctor_advice: 'Yes: Avoid aspirin and related painkillers',
    q_antibiotic_painkiller_reaction: 'Yes',
  },
  {
    age: 75,
    gender: 'Female',
    known_allergies_text: 'None known',
    chronic_diseases_text: 'Arthritis',
    current_medications_text: 'Paracetamol as needed',
    emergency_contact: 'Madhavi Silva - Daughter - +94 76 000 1111',
    caregiver_details: 'Family caregiver',
    has_medicine_allergy: false,
    q_past_reaction: 'No',
    q_reaction_symptoms: 'None',
    q_medicine_name: 'No',
    q_doctor_advice: 'No',
    q_antibiotic_painkiller_reaction: 'No',
  },
  {
    age: 70,
    gender: 'Male',
    known_allergies_text: 'Ibuprofen',
    chronic_diseases_text: 'Heart disease, Hypertension',
    current_medications_text: 'Aspirin, Bisoprolol, Atorvastatin',
    emergency_contact: 'Rashmi Fernando - Wife - +94 75 123 3333',
    caregiver_details: 'Cardiology clinic review',
    has_medicine_allergy: true,
    q_past_reaction: 'Not sure',
    q_reaction_symptoms: 'Dizziness',
    q_medicine_name: 'No',
    q_doctor_advice: 'Yes: Avoid strong painkillers',
    q_antibiotic_painkiller_reaction: 'Yes',
  },
  {
    age: 66,
    gender: 'Female',
    known_allergies_text: 'None known',
    chronic_diseases_text: 'Type 2 Diabetes',
    current_medications_text: 'Metformin, Gliclazide',
    emergency_contact: 'Suresh Kumara - Husband - +94 77 888 2222',
    caregiver_details: 'None',
    has_medicine_allergy: false,
    q_past_reaction: 'No',
    q_reaction_symptoms: 'None',
    q_medicine_name: 'No',
    q_doctor_advice: 'No',
    q_antibiotic_painkiller_reaction: 'No',
  },
];

const pick = (items, index) => items[index % items.length];

const severityRank = { Major: 3, Moderate: 2, Minor: 1 };

const mergeLevel = (a, b) => {
  const ra = severityRank[a] || 0;
  const rb = severityRank[b] || 0;
  return ra >= rb ? a : b;
};

const levelToModel = (level) => {
  const L = String(level || '').trim();
  if (L === 'Major') {
    return {
      risk_level: 'Dangerous',
      max_interaction_severity: 'high',
      interaction_count: 2,
      side_effect_count: 4,
      severe_side_effect_count: 2,
    };
  }
  if (L === 'Moderate') {
    return {
      risk_level: 'Warning',
      max_interaction_severity: 'medium',
      interaction_count: 1,
      side_effect_count: 3,
      severe_side_effect_count: 1,
    };
  }
  // Minor DDInter class → treat as lower concern for training (3-class label Safe)
  return {
    risk_level: 'Safe',
    max_interaction_severity: 'none',
    interaction_count: 0,
    side_effect_count: 1,
    severe_side_effect_count: 0,
  };
};

const toRiskScore = (riskLevel, profile) => {
  const age = Number(profile.age || 65);
  const ageBoost = Math.min(12, Math.max(0, age - 60));
  if (riskLevel === 'Dangerous') {
    return Math.min(100, 78 + ageBoost);
  }
  if (riskLevel === 'Warning') {
    return Math.min(85, 48 + ageBoost);
  }
  return Math.min(35, 8 + Math.floor(ageBoost / 2));
};

const readRealRows = () => {
  if (fs.existsSync(realJsonPath)) {
    return JSON.parse(fs.readFileSync(realJsonPath, 'utf8'));
  }
  if (fs.existsSync(realCsvPath)) {
    const lines = fs.readFileSync(realCsvPath, 'utf8').trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    return lines.map((line) => {
      const parts = parseCsvLine(line);
      return headers.reduce((acc, header, index) => {
        acc[header] = parts[index] ?? '';
        return acc;
      }, {});
    });
  }
  return [];
};

const loadDdinterPairsMerged = async () => {
  const files = fs
    .readdirSync(datasetRoot)
    .filter((f) => /^ddinter_downloads_code_[^.]+\.csv$/i.test(f))
    .map((f) => path.join(datasetRoot, f));

  if (!files.length) {
    throw new Error(`No DDInter CSV files found in ${datasetRoot}`);
  }

  const byKey = new Map();

  for (const filePath of files) {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    let header = true;
    for await (const line of rl) {
      if (header) {
        header = false;
        continue;
      }
      const parts = parseCsvLine(line);
      if (parts.length < 5) continue;
      const drugA = parts[1];
      const drugB = parts[3];
      const level = parts[4];
      const na = normalizeDrugName(drugA);
      const nb = normalizeDrugName(drugB);
      if (!na || !nb) continue;
      const pairKey = [na, nb].sort().join('::');
      const cleanLevel = String(level || '').trim();
      if (byKey.has(pairKey)) {
        byKey.set(pairKey, {
          drugA,
          drugB,
          level: mergeLevel(byKey.get(pairKey).level, cleanLevel),
          normalizedA: na,
          normalizedB: nb,
        });
      } else {
        byKey.set(pairKey, { drugA, drugB, level: cleanLevel, normalizedA: na, normalizedB: nb });
      }
    }
  }

  return Array.from(byKey.values());
};

const stratifiedSample = (pairs, budget) => {
  const buckets = { Major: [], Moderate: [], Minor: [] };
  for (const p of pairs) {
    const k = String(p.level || '').trim();
    if (buckets[k]) buckets[k].push(p);
  }
  const ratio = { Major: 0.35, Moderate: 0.35, Minor: 0.3 };
  const targets = {
    Major: Math.floor(budget * ratio.Major),
    Moderate: Math.floor(budget * ratio.Moderate),
    Minor: Math.floor(budget * ratio.Minor),
  };
  let leftover = budget - targets.Major - targets.Moderate - targets.Minor;
  const keys = ['Major', 'Moderate', 'Minor'];
  let i = 0;
  while (leftover > 0) {
    targets[keys[i % 3]] += 1;
    leftover -= 1;
    i += 1;
  }

  const shuffle = (arr) => {
    const a = [...arr];
    for (let j = a.length - 1; j > 0; j -= 1) {
      const k = Math.floor(Math.random() * (j + 1));
      [a[j], a[k]] = [a[k], a[j]];
    }
    return a;
  };

  const out = [];
  const selectedKeys = new Set();
  const pairKeyOf = (p) => [p.normalizedA, p.normalizedB].sort().join('::');

  for (const key of keys) {
    const pool = shuffle(buckets[key]);
    const take = Math.min(targets[key], pool.length);
    for (let t = 0; t < take; t += 1) {
      const p = pool[t];
      out.push(p);
      selectedKeys.add(pairKeyOf(p));
    }
  }

  if (out.length < budget) {
    const rest = shuffle(pairs.filter((p) => !selectedKeys.has(pairKeyOf(p))));
    for (const p of rest) {
      if (out.length >= budget) break;
      out.push(p);
    }
  }

  return shuffle(out.slice(0, budget));
};

const toCsvValue = (value) => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const rowsToCsv = (rows) => {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')),
  ].join('\n');
};

const buildDdinterRows = (sampled) => {
  const baseCheckId = 20000;
  const baseUserId = 5000;
  const now = new Date();
  const rows = [];

  sampled.forEach((pair, index) => {
    const profile = pick(profileCatalog, index);
    const model = levelToModel(pair.level);
    const riskScore = toRiskScore(model.risk_level, profile);
    const hasReaction = model.risk_level !== 'Safe' && index % 3 !== 0 ? 1 : 0;
    const hasSevereReaction = model.risk_level === 'Dangerous' && hasReaction ? 1 : 0;
    const date = new Date(now.getTime() - index * 3600000).toISOString();
    const inputMethod = index % 4 === 0 ? 'ocr' : index % 5 === 0 ? 'voice' : 'manual';
    const rawDisplay = `${pair.drugA.trim()} (interaction check vs ${pair.drugB.trim()})`;

    rows.push({
      medicine_check_id: baseCheckId + index,
      user_id: baseUserId + (index % profileCatalog.length),
      input_method: inputMethod,
      raw_input: rawDisplay,
      medicine_name: pair.drugA.trim(),
      normalized_drug_name: pair.normalizedA,
      rxnorm_cui: '',
      ingredient_name: pair.drugA.trim(),
      therapeutic_class: '',
      dose: '',
      frequency: model.risk_level === 'Dangerous' ? 'Three times daily' : 'Twice daily',
      risk_score: riskScore,
      risk_level: model.risk_level,
      side_effect_count: model.side_effect_count,
      severe_side_effect_count: model.severe_side_effect_count,
      side_effect_match_count: hasReaction ? 1 : 0,
      interaction_count: model.interaction_count,
      max_interaction_severity: model.max_interaction_severity,
      knowledge_sources: 'DDInter(public)',
      medicine_check_created_at: date,
      age: profile.age,
      gender: profile.gender,
      has_medicine_allergy: profile.has_medicine_allergy,
      known_allergies_text: profile.known_allergies_text,
      chronic_diseases_text: profile.chronic_diseases_text,
      current_medications_text: [profile.current_medications_text, pair.drugB.trim()].filter(Boolean).join(', '),
      emergency_contact: profile.emergency_contact,
      caregiver_details: profile.caregiver_details,
      q_past_reaction: profile.q_past_reaction,
      q_reaction_symptoms: hasReaction ? profile.q_reaction_symptoms : 'None',
      q_medicine_name: profile.q_medicine_name,
      q_doctor_advice: profile.q_doctor_advice,
      q_antibiotic_painkiller_reaction: profile.q_antibiotic_painkiller_reaction,
      reaction_count: hasReaction ? (hasSevereReaction ? 2 : 1) : 0,
      has_reaction_log: hasReaction,
      has_severe_reaction_log: hasSevereReaction,
      data_source: 'ddinter_public',
      seed_basis_medicine_check_id: '',
    });
  });

  return rows;
};

const runSeedSupplement = (count, realRows) => {
  if (count <= 0) return [];
  const medicineCatalog = [
    { raw: 'Amoxicillin 500mg', medicine: 'Amoxicillin', normalized: 'amoxicillin', family: 'penicillin', typicalRisk: 'Dangerous' },
    { raw: 'Paracetamol 500mg', medicine: 'Paracetamol', normalized: 'paracetamol', family: 'analgesic', typicalRisk: 'Safe' },
    { raw: 'Metformin 500mg', medicine: 'Metformin', normalized: 'metformin', family: 'biguanide', typicalRisk: 'Safe' },
  ];
  const rows = [];
  const baseCheckId = 30000;
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const profile = pick(profileCatalog, index);
    const medicine = pick(medicineCatalog, index);
    const riskLevel = medicine.typicalRisk;
    const riskScore = toRiskScore(riskLevel, profile);
    rows.push({
      medicine_check_id: baseCheckId + index,
      user_id: 6000 + (index % profileCatalog.length),
      input_method: 'manual',
      raw_input: medicine.raw,
      medicine_name: medicine.medicine,
      normalized_drug_name: medicine.normalized,
      rxnorm_cui: `${920000 + index}`,
      ingredient_name: medicine.medicine,
      therapeutic_class: medicine.family,
      dose: medicine.raw.split(' ').slice(-1)[0],
      frequency: 'Once daily',
      risk_score: riskScore,
      risk_level: riskLevel,
      side_effect_count: 2,
      severe_side_effect_count: 0,
      side_effect_match_count: 0,
      interaction_count: 0,
      max_interaction_severity: 'none',
      knowledge_sources: 'Supplement',
      medicine_check_created_at: new Date(now.getTime() - index * 86400000).toISOString(),
      age: profile.age,
      gender: profile.gender,
      has_medicine_allergy: profile.has_medicine_allergy,
      known_allergies_text: profile.known_allergies_text,
      chronic_diseases_text: profile.chronic_diseases_text,
      current_medications_text: profile.current_medications_text,
      emergency_contact: profile.emergency_contact,
      caregiver_details: profile.caregiver_details,
      q_past_reaction: profile.q_past_reaction,
      q_reaction_symptoms: 'None',
      q_medicine_name: profile.q_medicine_name,
      q_doctor_advice: profile.q_doctor_advice,
      q_antibiotic_painkiller_reaction: profile.q_antibiotic_painkiller_reaction,
      reaction_count: 0,
      has_reaction_log: 0,
      has_severe_reaction_log: 0,
      data_source: 'supplement_seed',
      seed_basis_medicine_check_id: realRows[0]?.medicine_check_id || '',
    });
  }
  return rows;
};

const main = async () => {
  fs.mkdirSync(dataDir, { recursive: true });
  const realRows = readRealRows().map((row) => ({
    ...row,
    data_source: 'real',
    seed_basis_medicine_check_id: row.medicine_check_id || row.seed_basis_medicine_check_id || '',
  }));

  console.log(`[ML] Dataset root: ${datasetRoot}`);
  const allPairs = await loadDdinterPairsMerged();
  console.log(`[ML] DDInter unique pairs (deduped): ${allPairs.length}`);

  const sampled = stratifiedSample(allPairs, Math.min(maxPublicRows, allPairs.length));
  console.log(`[ML] DDInter sampled for training: ${sampled.length}`);

  const ddinterRows = buildDdinterRows(sampled);
  const supplementRows = runSeedSupplement(seedSupplement, realRows);

  const trainingRows = [...realRows, ...ddinterRows, ...supplementRows];

  fs.writeFileSync(trainingJsonPath, JSON.stringify(trainingRows, null, 2));
  fs.writeFileSync(trainingCsvPath, rowsToCsv(trainingRows));

  const counts = trainingRows.reduce((acc, r) => {
    acc[r.data_source] = (acc[r.data_source] || 0) + 1;
    return acc;
  }, {});
  console.log('[ML] Row mix:', counts);
  console.log(`[ML] Total training rows: ${trainingRows.length}`);
  console.log(`[ML] JSON -> ${trainingJsonPath}`);
  console.log(`[ML] CSV  -> ${trainingCsvPath}`);
};

main().catch((e) => {
  console.error('[ML] buildPublicTrainingDataset failed:', e.message);
  process.exit(1);
});
