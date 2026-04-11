const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', 'data');
const realJsonPath = path.join(dataDir, 'medicine_safety_dataset.json');
const realCsvPath = path.join(dataDir, 'medicine_safety_dataset.csv');
const trainingJsonPath = path.join(dataDir, 'medicine_safety_training_dataset.json');
const trainingCsvPath = path.join(dataDir, 'medicine_safety_training_dataset.csv');

const rowCount = Number(process.env.ML_SEED_ROWS || 120);

const medicineCatalog = [
  { raw: 'Amoxicillin 500mg', medicine: 'Amoxicillin', normalized: 'amoxicillin', family: 'penicillin', typicalRisk: 'Dangerous' },
  { raw: 'Co-amoxiclav 625mg', medicine: 'Co-amoxiclav', normalized: 'co-amoxiclav', family: 'penicillin', typicalRisk: 'Dangerous' },
  { raw: 'Azithromycin 500mg', medicine: 'Azithromycin', normalized: 'azithromycin', family: 'macrolide', typicalRisk: 'Warning' },
  { raw: 'Paracetamol 500mg', medicine: 'Paracetamol', normalized: 'paracetamol', family: 'analgesic', typicalRisk: 'Safe' },
  { raw: 'Ibuprofen 400mg', medicine: 'Ibuprofen', normalized: 'ibuprofen', family: 'nsaid', typicalRisk: 'Warning' },
  { raw: 'Diclofenac 50mg', medicine: 'Diclofenac', normalized: 'diclofenac', family: 'nsaid', typicalRisk: 'Dangerous' },
  { raw: 'Metformin 500mg', medicine: 'Metformin', normalized: 'metformin', family: 'biguanide', typicalRisk: 'Safe' },
  { raw: 'Losartan 50mg', medicine: 'Losartan', normalized: 'losartan', family: 'arb', typicalRisk: 'Safe' },
  { raw: 'Ciprofloxacin 500mg', medicine: 'Ciprofloxacin', normalized: 'ciprofloxacin', family: 'fluoroquinolone', typicalRisk: 'Warning' },
  { raw: 'Aspirin 75mg', medicine: 'Aspirin', normalized: 'aspirin', family: 'salicylate', typicalRisk: 'Dangerous' },
];

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

const severityByRisk = {
  Safe: 'mild',
  Warning: 'moderate',
  Dangerous: 'severe',
};

const toCsvValue = (value) => {
  if (value == null) {
    return '';
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const rowsToCsv = (rows) => {
  if (!rows.length) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(',')),
  ].join('\n');
};

const readRealRows = () => {
  if (fs.existsSync(realJsonPath)) {
    return JSON.parse(fs.readFileSync(realJsonPath, 'utf8'));
  }

  if (fs.existsSync(realCsvPath)) {
    const lines = fs.readFileSync(realCsvPath, 'utf8').trim().split(/\r?\n/);
    const headers = lines.shift().split(',');
    return lines.map((line) => {
      const values = line.split(',');
      return headers.reduce((acc, header, index) => {
        acc[header] = values[index] ?? '';
        return acc;
      }, {});
    });
  }

  return [];
};

const pick = (items, index) => items[index % items.length];

const inferRisk = (profile, medicine) => {
  const allergyText = String(profile.known_allergies_text || '').toLowerCase();
  const hasPenicillinAllergy = allergyText.includes('penicillin');
  const hasAspirinAllergy = allergyText.includes('aspirin');
  const hasPainkillerConcern = String(profile.q_antibiotic_painkiller_reaction || '').toLowerCase() === 'yes';

  if ((medicine.family === 'penicillin' && hasPenicillinAllergy) || (medicine.medicine === 'Aspirin' && hasAspirinAllergy)) {
    return 'Dangerous';
  }

  if ((medicine.family === 'nsaid' && hasPainkillerConcern) || medicine.typicalRisk === 'Warning') {
    return 'Warning';
  }

  return medicine.typicalRisk;
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

const buildSyntheticRows = (count, realRows) => {
  const rows = [];
  const baseUserId = 1000;
  const baseCheckId = 10000;
  const now = new Date('2026-04-09T09:00:00+05:30');

  for (let index = 0; index < count; index += 1) {
    const profile = pick(profileCatalog, index);
    const medicine = pick(medicineCatalog, index * 3 + 1);
    const riskLevel = inferRisk(profile, medicine);
    const riskScore = toRiskScore(riskLevel, profile);
    const hasReaction = riskLevel !== 'Safe' && index % 3 !== 0 ? 1 : 0;
    const hasSevereReaction = riskLevel === 'Dangerous' && hasReaction ? 1 : 0;
    const date = new Date(now.getTime() - index * 86400000).toISOString();
    const realTemplate = realRows[index % Math.max(realRows.length, 1)] || {};

    rows.push({
      medicine_check_id: baseCheckId + index,
      user_id: baseUserId + (index % profileCatalog.length),
      input_method: index % 4 === 0 ? 'ocr' : index % 5 === 0 ? 'voice' : 'manual',
      raw_input: medicine.raw,
      medicine_name: medicine.medicine,
      normalized_drug_name: medicine.normalized,
      rxnorm_cui: `${900000 + index}`,
      ingredient_name: medicine.medicine,
      therapeutic_class: medicine.family,
      dose: medicine.raw.split(' ').slice(-1)[0],
      frequency: riskLevel === 'Safe' ? 'Once daily' : riskLevel === 'Warning' ? 'Twice daily' : 'Three times daily',
      risk_score: riskScore,
      risk_level: riskLevel,
      side_effect_count: riskLevel === 'Safe' ? 2 : riskLevel === 'Warning' ? 3 : 4,
      severe_side_effect_count: riskLevel === 'Dangerous' ? 2 : riskLevel === 'Warning' ? 1 : 0,
      side_effect_match_count: hasReaction ? 1 : 0,
      interaction_count: riskLevel === 'Safe' ? 0 : riskLevel === 'Warning' ? 1 : 2,
      max_interaction_severity: riskLevel === 'Dangerous' ? 'high' : riskLevel === 'Warning' ? 'medium' : 'none',
      knowledge_sources: 'RxNorm|SIDER|DDInter',
      medicine_check_created_at: date,
      age: profile.age,
      gender: profile.gender,
      has_medicine_allergy: profile.has_medicine_allergy,
      known_allergies_text: profile.known_allergies_text,
      chronic_diseases_text: profile.chronic_diseases_text,
      current_medications_text: profile.current_medications_text,
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
      data_source: 'seeded',
      seed_basis_medicine_check_id: realTemplate.medicine_check_id || '',
    });
  }

  return rows;
};

const normalizeRealRows = (rows) =>
  rows.map((row) => ({
    ...row,
    data_source: 'real',
    seed_basis_medicine_check_id: row.medicine_check_id || '',
  }));

const main = () => {
  fs.mkdirSync(dataDir, { recursive: true });

  const realRows = readRealRows();
  const syntheticRows = buildSyntheticRows(rowCount, realRows);
  const trainingRows = [...normalizeRealRows(realRows), ...syntheticRows];

  fs.writeFileSync(trainingJsonPath, JSON.stringify(trainingRows, null, 2));
  fs.writeFileSync(trainingCsvPath, rowsToCsv(trainingRows));

  console.log(`[ML] Real rows kept: ${realRows.length}`);
  console.log(`[ML] Seeded rows added: ${syntheticRows.length}`);
  console.log(`[ML] Training rows total: ${trainingRows.length}`);
  console.log(`[ML] JSON -> ${trainingJsonPath}`);
  console.log(`[ML] CSV  -> ${trainingCsvPath}`);
};

main();
