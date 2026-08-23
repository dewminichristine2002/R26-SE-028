const { pool } = require('../config/db');
const { saveRoutine } = require('../models/routineModel');

const DEFAULT_MEDICATION = {
  doseForm: 'Tablet',
  takeWith: 'Breakfast',
  intakeTiming: 'After',
};

const MEDICINE_SYNONYM_GROUPS = [
  ['metformin', 'obmet', 'glucophage', 'glycomet'],
  ['aspirin', 'asprin', 'acetylsalicylic acid'],
  ['paracetamol', 'acetaminophen', 'panadol'],
];

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const NUMBER_WORD_CAPTURE =
  '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\\s](?:one|two|three|four|five|six|seven|eight|nine))?';
const NUMBER_CAPTURE = `(?:\\d+(?:\\.\\d+)?|${NUMBER_WORD_CAPTURE})`;

const normalizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeLower = (value) => normalizeText(value).toLowerCase();

const normalizeCommandText = (message) => normalizeLower(message).replace(/[.!?,]/g, '').trim();

const isConfirmMessage = (message) =>
  /^(yes|yeah|yep|ok|okay|confirm|confirmed|yes confirm it|do it|go ahead|please do|save it|delete it|update it|send it)$/i.test(normalizeCommandText(message));

const isCancelMessage = (message) =>
  /^(no|cancel|cancel this change|stop|never mind|nevermind|don't|do not|discard)$/i.test(normalizeCommandText(message));

const parseNumberWord = (value) => {
  const normalized = normalizeLower(value).replace(/-/g, ' ');
  if (!normalized) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, normalized)) {
    return NUMBER_WORDS[normalized];
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] >= 20 && NUMBER_WORDS[parts[1]] > 0 && NUMBER_WORDS[parts[1]] < 10) {
    return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  }

  return null;
};

const toNumber = (value) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return parseNumberWord(value);
};

const matchNumber = (text, pattern) => {
  const match = String(text || '').match(new RegExp(pattern, 'i'));
  return toNumber(match?.[1]);
};

const formatClock = (hour, minute, period) => {
  let normalizedHour = Number(hour);
  const normalizedMinute = Number(minute || 0);
  let normalizedPeriod = period ? String(period).toUpperCase() : '';

  if (!Number.isFinite(normalizedHour) || !Number.isFinite(normalizedMinute)) {
    return '';
  }

  if (!normalizedPeriod) {
    normalizedPeriod = normalizedHour < 12 ? 'AM' : 'PM';
  }

  if (normalizedHour === 0) {
    normalizedHour = 12;
  } else if (normalizedHour > 12) {
    normalizedHour -= 12;
  }

  if (normalizedHour < 1 || normalizedHour > 12 || normalizedMinute < 0 || normalizedMinute > 59) {
    return '';
  }

  return `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')} ${normalizedPeriod}`;
};

const extractTime = (message) => {
  const text = normalizeLower(message);
  const match = text.match(/\b(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?\b/i);
  if (!match) {
    return '';
  }
  return formatClock(match[1], match[2] || '00', match[3] || '');
};

const mealFromText = (message) => {
  const text = normalizeLower(message);
  if (/\b(breakfast|morning)\b/.test(text)) return 'breakfast';
  if (/\b(lunch|noon|afternoon)\b/.test(text)) return 'lunch';
  if (/\b(dinner|evening|supper)\b/.test(text)) return 'dinner';
  if (/\b(sleep|bed|bedtime|night)\b/.test(text)) return 'sleep';
  return '';
};

const mealLabel = (key) => ({
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  sleep: 'Sleep',
}[key] || 'Routine');

const extractMedicineName = (message) => {
  const text = normalizeText(message);
  const quoted = text.match(/["'`]([^"'`]{2,80})["'`]/);
  if (quoted) {
    return normalizeText(quoted[1]);
  }

  const patterns = [
    /\b(?:add|create|save|record|start|take|refill|remove|delete|update|change|edit|send|request)\s+(?:medicine|medication|pill|tablet|stock|refill alert|low stock alert)?\s*([a-z][a-z0-9 -]{1,80}?)(?:\s+(?:\d|with|to|from|by|for|after|before|at|daily|every|stock|medicine|medication|pill|tablet|alert|refill|low)|[?.!]|$)/i,
    /\b(?:for|of)\s+([a-z][a-z0-9 -]{1,80}?)(?:\s+(?:stock|medicine|medication|pill|tablet|alert|refill)|[?.!]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const candidate = normalizeText(match[1])
      .replace(/\b(the|my|a|an|for|of|to|medicine|medication|pill|tablet|stock|alert|refill|low|caregiver)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/[a-zA-Z]{2,}/.test(candidate)) {
      return candidate;
    }
  }

  return '';
};

const extractMedicationFields = (message) => {
  const text = normalizeText(message);
  const lower = text.toLowerCase();
  const dosageMg = toNumber((lower.match(/\b(\d+(?:\.\d+)?)\s*mg\b/) || [])[1]);
  const totalQuantity = toNumber(
    (lower.match(/\b(?:quantity|qty|stock|supply|total)\s*(?:is|to|of)?\s*(\d+(?:\.\d+)?)\b/) || [])[1] ||
    (lower.match(/\b(\d+(?:\.\d+)?)\s*(?:tablets|tablet|pills|pill|capsules|capsule)\b/) || [])[1]
  );
  const dailyAmount = toNumber(
    (lower.match(/\b(?:take|takes|dose|daily|per day|each time)\s*(\d+(?:\.\d+)?)\b/) || [])[1] ||
    (lower.match(/\b(\d+(?:\.\d+)?)\s*(?:tablet|pill|capsule)s?\s*(?:daily|per day|each time)\b/) || [])[1]
  );

  const slots = [];
  if (/\bbreakfast\b/.test(lower)) slots.push('Breakfast');
  if (/\blunch\b/.test(lower)) slots.push('Lunch');
  if (/\bdinner|supper\b/.test(lower)) slots.push('Dinner');
  if (/\bsleep|bed|night\b/.test(lower)) slots.push('Before Sleep');

  return {
    medicineName: extractMedicineName(text),
    dosageMg,
    totalQuantity,
    dailyAmount,
    doseForm: /\b(drop|drops)\b/.test(lower) ? 'Drops' : DEFAULT_MEDICATION.doseForm,
    takeWith: slots.length ? slots.join(', ') : DEFAULT_MEDICATION.takeWith,
    intakeTiming: /\bbefore\b/.test(lower) ? 'Before' : DEFAULT_MEDICATION.intakeTiming,
  };
};

const missingMedicationFields = (payload) => {
  const missing = [];
  if (!payload.medicineName) missing.push('medicine name');
  if (!toNumber(payload.dosageMg) || toNumber(payload.dosageMg) <= 0) missing.push('strength in mg');
  if (!toNumber(payload.totalQuantity) || toNumber(payload.totalQuantity) <= 0) missing.push('total quantity');
  if (!toNumber(payload.dailyAmount) || toNumber(payload.dailyAmount) <= 0) missing.push('daily amount');
  return missing;
};

const buildCreateMedicationAction = (message) => {
  const fields = extractMedicationFields(message);
  const missing = missingMedicationFields(fields);
  if (missing.length) {
    return {
      needsMoreInfo: true,
      reply: `I can add that medicine, but I still need: ${missing.join(', ')}. Try: "Add Metformin 500mg, 30 tablets, take 1 after breakfast."`,
    };
  }

  return {
    action: {
      domain: 'medication',
      operation: 'create',
      payload: fields,
      summary: `Add ${fields.medicineName} ${fields.dosageMg}mg with ${fields.totalQuantity} tablet(s), ${fields.dailyAmount} each time, ${fields.intakeTiming.toLowerCase()} ${fields.takeWith}.`,
      navigation: {
        screen: 'home',
        launchIntent: { type: 'medicine-list', highlight: { kind: 'medicationName', value: fields.medicineName } },
      },
    },
  };
};

const buildUpdateMedicationAction = (message) => {
  const fields = extractMedicationFields(message);
  const changes = {};
  if (fields.dosageMg) changes.dosageMg = fields.dosageMg;
  if (fields.totalQuantity) changes.totalQuantity = fields.totalQuantity;
  if (fields.dailyAmount) changes.dailyAmount = fields.dailyAmount;
  if (fields.takeWith !== DEFAULT_MEDICATION.takeWith || /\b(breakfast|lunch|dinner|sleep|bed|night)\b/i.test(message)) {
    changes.takeWith = fields.takeWith;
  }
  if (/\b(before|after)\b/i.test(message)) {
    changes.intakeTiming = fields.intakeTiming;
  }

  if (!fields.medicineName || Object.keys(changes).length === 0) {
    return {
      needsMoreInfo: true,
      reply: 'Tell me which medicine to update and what to change, for example: "Change Metformin daily amount to 2 after dinner."',
    };
  }

  return {
    action: {
      domain: 'medication',
      operation: 'update',
      target: { medicineName: fields.medicineName },
      payload: changes,
      summary: `Update ${fields.medicineName}: ${Object.entries(changes).map(([key, value]) => `${key} ${value}`).join(', ')}.`,
      navigation: {
        screen: 'home',
        launchIntent: { type: 'medicine-list', highlight: { kind: 'medicationName', value: fields.medicineName } },
      },
    },
  };
};

const buildDeleteMedicationAction = (message) => {
  const medicineName = extractMedicineName(message);
  if (!medicineName) {
    return {
      needsMoreInfo: true,
      reply: 'Which medicine should I delete? For example: "Delete Metformin."',
    };
  }

  return {
    action: {
      domain: 'medication',
      operation: 'delete',
      target: { medicineName },
      summary: `Delete ${medicineName} from the medicine list.`,
      navigation: {
        screen: 'home',
        launchIntent: { type: 'medicine-list', highlight: { kind: 'deletedMedicationName', value: medicineName } },
      },
    },
  };
};

const buildRoutineAction = (message) => {
  const mealKey = mealFromText(message);
  const time = extractTime(message);
  if (!mealKey || !time) {
    return {
      needsMoreInfo: true,
      reply: 'Tell me the routine time to change, for example: "Set breakfast to 8 AM" or "Change sleep time to 10:30 PM."',
    };
  }

  return {
    action: {
      domain: 'routine',
      operation: 'update',
      payload: { mealKey, time },
      summary: `Set ${mealLabel(mealKey)} to ${time}.`,
      navigation: {
        screen: 'home',
        launchIntent: { type: 'routine-setup', highlight: { mealKey } },
      },
    },
  };
};

const buildStockAction = (message) => {
  const text = normalizeLower(message);
  const normalized = normalizeText(message);
  const stockTargetMatch =
    normalized.match(/\b(?:set|make|change|update)\s+([a-z][a-z0-9 -]{1,80}?)\s+(?:stock|supply|quantity|pills left)\b/i) ||
    normalized.match(/\b(?:to|for|of)\s+([a-z][a-z0-9 -]{1,80}?)\s+(?:to|into)\s+(?:the\s+)?(?:stock|supply)\b/i) ||
    normalized.match(/\b(?:to|for|of)\s+([a-z][a-z0-9 -]{1,80}?)(?:\s+(?:stock|supply|refill|medicine|medication)|[?.!]|$)/i);
  const stockTargetName = normalizeText(stockTargetMatch?.[1] || '')
    .replace(/\b(?:to|into)\s+(?:the\s+)?(?:stock|supply)\b.*$/i, '')
    .trim();
  const extractedMedicineName = extractMedicineName(message);
  const medicineName = stockTargetName || (toNumber(extractedMedicineName) == null ? extractedMedicineName : '');
  const amount =
    matchNumber(text, `\\b(?:add|refill|increase|by|with)\\s+(${NUMBER_CAPTURE})\\b`) ||
    matchNumber(text, `\\b(${NUMBER_CAPTURE})\\s*(?:tablets|tablet|pills|pill)\\b`);
  const setAmount = matchNumber(
    text,
    `\\b(?:set|make|change)\\b[\\s\\S]{0,30}\\b(?:stock|quantity|pills left)\\b[\\s\\S]{0,12}\\b(?:to|as)\\s+(${NUMBER_CAPTURE})\\b`
  );

  if (!medicineName || (!amount && !setAmount)) {
    return {
      needsMoreInfo: true,
      reply: 'Tell me the medicine and stock amount, for example: "Add 20 tablets to Metformin stock" or "Set Metformin stock to 50."',
    };
  }

  const operation = setAmount ? 'set_stock' : 'refill_stock';
  const quantity = setAmount || amount;

  return {
    action: {
      domain: 'stock',
      operation,
      target: { medicineName },
      payload: { quantity },
      summary: operation === 'set_stock'
        ? `Set ${medicineName} stock to ${quantity} tablet(s).`
        : `Add ${quantity} tablet(s) to ${medicineName} stock.`,
      navigation: {
        screen: 'home',
        launchIntent: { type: 'medicine-stock', highlight: { kind: 'medicationName', value: medicineName } },
      },
    },
  };
};

const buildAlertAction = (message) => {
  const text = normalizeLower(message);
  const medicineName = extractMedicineName(message);

  if (/\b(mark|set)\b[\s\S]{0,20}\b(read|seen)\b/.test(text)) {
    return {
      action: {
        domain: 'alert',
        operation: 'mark_read',
        payload: { scope: /\ball\b/.test(text) ? 'all' : 'latest' },
        summary: /\ball\b/.test(text) ? 'Mark all medication caregiver alerts as read.' : 'Mark the latest medication caregiver alert as read.',
        navigation: { screen: 'home', launchIntent: { type: 'caregiver-alerts' } },
      },
    };
  }

  if (/\b(delete|remove|clear|dismiss)\b/.test(text) && /\b(alert|alerts|notification|notifications)\b/.test(text)) {
    return {
      action: {
        domain: 'alert',
        operation: 'delete',
        payload: { scope: /\ball\b/.test(text) ? 'all_read' : 'latest_read' },
        summary: /\ball\b/.test(text) ? 'Delete all read medication caregiver alerts.' : 'Delete the latest read medication caregiver alert.',
        navigation: { screen: 'home', launchIntent: { type: 'caregiver-alerts' } },
      },
    };
  }

  if (/\b(send|tell|notify|request)\b/.test(text) && /\b(caregiver|refill|low stock|stock)\b/.test(text)) {
    if (!medicineName) {
      return {
        needsMoreInfo: true,
        reply: 'Which medicine should I send the caregiver alert for?',
      };
    }
    const alertType = /\b(refill|need)\b/.test(text) ? 'refill' : 'low_stock';
    return {
      action: {
        domain: 'alert',
        operation: 'create',
        target: { medicineName },
        payload: { alertType },
        summary: `Send a ${alertType === 'refill' ? 'refill' : 'low stock'} alert for ${medicineName} to the caregiver.`,
        navigation: {
          screen: 'home',
          launchIntent: { type: 'medicine-stock', highlight: { kind: 'medicationName', value: medicineName } },
        },
      },
    };
  }

  return null;
};

const normalizeMedicineLookupName = (value) =>
  normalizeLower(value)
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/g, ' ')
    .replace(/\b(?:tablets?|pills?|capsules?|stock|supply|refill|medicine|medication|dose|daily|the|my|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildMedicineLookupCandidates = (value) => {
  const base = normalizeMedicineLookupName(value);
  const candidates = new Set();
  if (base) {
    candidates.add(base);
  }

  for (const group of MEDICINE_SYNONYM_GROUPS) {
    const normalizedGroup = group.map((item) => normalizeMedicineLookupName(item)).filter(Boolean);
    const matchesGroup = normalizedGroup.some((item) => item === base);
    if (matchesGroup) {
      normalizedGroup.forEach((item) => candidates.add(item));
    }
  }

  return Array.from(candidates);
};

const levenshteinDistance = (left, right) => {
  const a = String(left || '');
  const b = String(right || '');
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
};

const scoreMedicineMatch = (requestedName, savedName) => {
  const requested = normalizeMedicineLookupName(requestedName);
  const saved = normalizeMedicineLookupName(savedName);
  if (!requested || !saved) {
    return null;
  }

  if (requested === saved) {
    return 0;
  }

  const requestedCandidates = buildMedicineLookupCandidates(requested);
  const savedCandidates = buildMedicineLookupCandidates(saved);
  if (requestedCandidates.some((candidate) => savedCandidates.includes(candidate))) {
    return 1;
  }

  if (requested.includes(saved) || saved.includes(requested)) {
    return 2;
  }

  const distance = levenshteinDistance(requested, saved);
  if (requested.length >= 5 && saved.length >= 5 && distance <= 2) {
    return 3 + distance;
  }

  return null;
};

const parseAgenticAction = (message) => {
  const text = normalizeLower(message);

  if (/\b(alert|alerts|notification|notifications|caregiver)\b/.test(text) && /\b(send|tell|notify|request|mark|read|delete|remove|clear|dismiss)\b/.test(text)) {
    return buildAlertAction(message);
  }
  if (/\b(stock|refill|pills left|quantity)\b/.test(text) && /\b(add|refill|set|change|update|increase)\b/.test(text)) {
    return buildStockAction(message);
  }
  if (/\b(add|create|save|record|start)\b/.test(text) && (/\b(medicine|medication|pill|pills|tablet|tablets|capsule|capsules)\b/.test(text) || /\b\d+(?:\.\d+)?\s*mg\b/.test(text))) {
    return buildCreateMedicationAction(message);
  }
  if (/\b(delete|remove)\b/.test(text) && /\b(medicine|medication|pill|tablet)\b/.test(text)) {
    return buildDeleteMedicationAction(message);
  }
  if (/\b(update|change|edit|set)\b/.test(text) && (/\b(medicine|medication|pill|pills|tablet|tablets|dose|daily amount)\b/.test(text) || /\b\d+(?:\.\d+)?\s*mg\b/.test(text))) {
    return buildUpdateMedicationAction(message);
  }
  if (/\b(set|change|update)\b/.test(text) && /\b(routine|breakfast|lunch|dinner|sleep|bedtime|meal time)\b/.test(text)) {
    return buildRoutineAction(message);
  }

  return null;
};

const getMedicationByName = async (userId, medicineName) => {
  const lookup = normalizeMedicineLookupName(medicineName);
  if (!lookup) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM user_medications
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 200
    `,
    [userId]
  );

  const matches = result.rows
    .map((row, index) => ({
      row,
      index,
      score: scoreMedicineMatch(lookup, row.medicine_name),
    }))
    .filter((item) => item.score !== null)
    .sort((left, right) => (left.score - right.score) || (left.index - right.index));

  return matches[0]?.row || null;
};

const listMedicationNames = async (userId) => {
  const result = await pool.query(
    `
      SELECT medicine_name
      FROM user_medications
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 8
    `,
    [userId]
  );
  return result.rows.map((row) => normalizeText(row.medicine_name)).filter(Boolean);
};

const throwMedicationNotFound = async (userId, requestedMedicineName) => {
  const err = new Error('Medication not found');
  err.statusCode = 404;
  err.requestedMedicineName = normalizeText(requestedMedicineName);
  err.availableMedicationNames = await listMedicationNames(userId);
  throw err;
};

const createMedication = async (userId, payload) => {
  const result = await pool.query(
    `
      INSERT INTO user_medications (
        user_id, medicine_name, selected_color, selected_shape, total_quantity,
        dosage_mg, daily_amount, dose_form, take_with, intake_timing
      )
      VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, $7, $8)
      RETURNING id, medicine_name, total_quantity, dosage_mg, daily_amount, dose_form, take_with, intake_timing, created_at
    `,
    [
      userId,
      payload.medicineName,
      Number(payload.totalQuantity),
      Number(payload.dosageMg),
      Number(payload.dailyAmount),
      payload.doseForm || DEFAULT_MEDICATION.doseForm,
      payload.takeWith || DEFAULT_MEDICATION.takeWith,
      payload.intakeTiming || DEFAULT_MEDICATION.intakeTiming,
    ]
  );

  const medication = result.rows[0];
  await pool.query(
    `
      INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (medication_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          initial_quantity = EXCLUDED.initial_quantity,
          current_quantity = EXCLUDED.current_quantity,
          updated_at = NOW()
    `,
    [userId, medication.id, Number(payload.totalQuantity)]
  );

  return medication;
};

const updateMedication = async (userId, action) => {
  const medication = await getMedicationByName(userId, action.target?.medicineName || '');
  if (!medication) {
    await throwMedicationNotFound(userId, action.target?.medicineName || '');
  }

  const next = {
    medicineName: medication.medicine_name,
    totalQuantity: Number(medication.total_quantity),
    dosageMg: Number(medication.dosage_mg),
    dailyAmount: Number(medication.daily_amount),
    doseForm: medication.dose_form || DEFAULT_MEDICATION.doseForm,
    takeWith: medication.take_with || DEFAULT_MEDICATION.takeWith,
    intakeTiming: medication.intake_timing || DEFAULT_MEDICATION.intakeTiming,
    ...(action.payload || {}),
  };

  const result = await pool.query(
    `
      UPDATE user_medications
      SET medicine_name = $1,
          total_quantity = $2,
          dosage_mg = $3,
          daily_amount = $4,
          dose_form = $5,
          take_with = $6,
          intake_timing = $7,
          updated_at = NOW()
      WHERE id = $8 AND user_id = $9
      RETURNING id, medicine_name, total_quantity, dosage_mg, daily_amount, dose_form, take_with, intake_timing, updated_at
    `,
    [
      next.medicineName,
      Number(next.totalQuantity),
      Number(next.dosageMg),
      Number(next.dailyAmount),
      next.doseForm,
      next.takeWith,
      next.intakeTiming,
      medication.id,
      userId,
    ]
  );

  await pool.query(
    `
      INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (medication_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          initial_quantity = EXCLUDED.initial_quantity,
          current_quantity = EXCLUDED.current_quantity,
          updated_at = NOW()
    `,
    [userId, medication.id, Number(next.totalQuantity)]
  );

  return result.rows[0];
};

const deleteMedication = async (userId, medicineName) => {
  const medication = await getMedicationByName(userId, medicineName);
  if (!medication) {
    await throwMedicationNotFound(userId, medicineName);
  }
  const result = await pool.query(
    `DELETE FROM user_medications WHERE id = $1 AND user_id = $2 RETURNING id, medicine_name`,
    [medication.id, userId]
  );
  return result.rows[0];
};

const updateRoutine = async (userId, payload) => {
  const existing = await pool.query(
    `SELECT breakfast_time, lunch_time, dinner_time, sleep_time FROM user_routines WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const current = existing.rows[0] || {};
  const mealTimes = {
    breakfast: current.breakfast_time || '08:00 AM',
    lunch: current.lunch_time || '01:00 PM',
    dinner: current.dinner_time || '07:00 PM',
    sleep: current.sleep_time || '10:30 PM',
    [payload.mealKey]: payload.time,
  };
  return saveRoutine(userId, mealTimes);
};

const refillStock = async (userId, action) => {
  const medication = await getMedicationByName(userId, action.target?.medicineName || '');
  if (!medication) {
    await throwMedicationNotFound(userId, action.target?.medicineName || '');
  }

  const quantity = Math.max(1, Number(action.payload?.quantity) || 1);
  await pool.query(
    `
      INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (medication_id) DO NOTHING
    `,
    [userId, medication.id, Math.max(0, Number(medication.total_quantity) || 0)]
  );

  const sql = action.operation === 'set_stock'
    ? `
        UPDATE medication_stock
        SET current_quantity = $3::numeric,
            initial_quantity = GREATEST(initial_quantity, $3::numeric),
            updated_at = NOW()
        WHERE medication_id = $1 AND user_id = $2
        RETURNING current_quantity, initial_quantity
      `
    : `
        UPDATE medication_stock
        SET current_quantity = current_quantity + $3::numeric,
            initial_quantity = initial_quantity + $3::numeric,
            updated_at = NOW()
        WHERE medication_id = $1 AND user_id = $2
        RETURNING current_quantity, initial_quantity
      `;
  const result = await pool.query(sql, [medication.id, userId, quantity]);
  await pool.query(
    `UPDATE user_medications SET total_quantity = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [medication.id, userId, result.rows[0].current_quantity]
  );
  return {
    medicationId: medication.id,
    medicineName: medication.medicine_name,
    currentQuantity: Number(result.rows[0].current_quantity) || 0,
    initialQuantity: Number(result.rows[0].initial_quantity) || 0,
  };
};

const createCaregiverAlert = async (userId, action) => {
  const medication = await getMedicationByName(userId, action.target?.medicineName || '');
  if (!medication) {
    await throwMedicationNotFound(userId, action.target?.medicineName || '');
  }

  const ownerResult = await pool.query(
    `SELECT full_name, caregiver_email, caregiver_phone FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const owner = ownerResult.rows[0] || {};
  const caregiverEmail = normalizeText(owner.caregiver_email);
  if (!caregiverEmail) {
    const err = new Error('No caregiver email found in profile');
    err.statusCode = 400;
    throw err;
  }

  const patientName = normalizeText(owner.full_name) || 'Patient';
  const medicineName = normalizeText(medication.medicine_name) || 'medicine';
  const isRefill = action.payload?.alertType === 'refill';
  const title = isRefill ? 'Refill Alert' : 'Low Stock Alert';
  const message = isRefill
    ? `${patientName} says: I need my ${medicineName} medicine. Please arrange a refill.`
    : `Manual request: ${patientName} has low stock for ${medicineName}. Please check the supply.`;

  const result = await pool.query(
    `
      INSERT INTO caregiver_alerts (user_id, medication_id, caregiver_email, caregiver_phone, title, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, message, is_read, created_at
    `,
    [userId, medication.id, caregiverEmail, normalizeText(owner.caregiver_phone) || null, title, message]
  );
  return result.rows[0];
};

const updateCaregiverAlert = async (userId, action) => {
  if (action.operation === 'mark_read') {
    const scope = action.payload?.scope || 'latest';
    const result = await pool.query(
      scope === 'all'
        ? `UPDATE caregiver_alerts SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE user_id = $1 AND is_read = FALSE RETURNING id`
        : `
            UPDATE caregiver_alerts
            SET is_read = TRUE, read_at = COALESCE(read_at, NOW())
            WHERE id = (
              SELECT id FROM caregiver_alerts WHERE user_id = $1 AND is_read = FALSE ORDER BY created_at DESC LIMIT 1
            )
            RETURNING id
          `,
      [userId]
    );
    return { updatedCount: result.rows.length };
  }

  const result = await pool.query(
    action.payload?.scope === 'all_read'
      ? `DELETE FROM caregiver_alerts WHERE user_id = $1 AND is_read = TRUE RETURNING id`
      : `
          DELETE FROM caregiver_alerts
          WHERE id = (
            SELECT id FROM caregiver_alerts WHERE user_id = $1 AND is_read = TRUE ORDER BY created_at DESC LIMIT 1
          )
          RETURNING id
        `,
    [userId]
  );
  return { deletedCount: result.rows.length };
};

const executeAgenticAction = async ({ userId, action }) => {
  let data;
  if (action.domain === 'medication' && action.operation === 'create') {
    data = await createMedication(userId, action.payload || {});
  } else if (action.domain === 'medication' && action.operation === 'update') {
    data = await updateMedication(userId, action);
  } else if (action.domain === 'medication' && action.operation === 'delete') {
    data = await deleteMedication(userId, action.target?.medicineName || '');
  } else if (action.domain === 'routine') {
    data = await updateRoutine(userId, action.payload || {});
  } else if (action.domain === 'stock') {
    data = await refillStock(userId, action);
  } else if (action.domain === 'alert' && action.operation === 'create') {
    data = await createCaregiverAlert(userId, action);
  } else if (action.domain === 'alert') {
    data = await updateCaregiverAlert(userId, action);
  } else {
    const err = new Error('Unsupported action');
    err.statusCode = 400;
    throw err;
  }

  const actualMedicineName = normalizeText(data?.medicineName || data?.medicine_name || '');
  const navigation = {
    ...(action.navigation || {}),
    launchIntent: {
      ...(action.navigation?.launchIntent || {}),
      highlight: actualMedicineName && action.navigation?.launchIntent?.highlight?.kind === 'medicationName'
        ? {
            ...(action.navigation.launchIntent.highlight || {}),
            value: actualMedicineName,
          }
        : action.navigation?.launchIntent?.highlight,
      nonce: Date.now(),
    },
  };

  const completedSummary = action.domain === 'stock' && actualMedicineName
    ? action.operation === 'set_stock'
      ? `Set ${actualMedicineName} stock to ${Number(data.currentQuantity) || 0} tablet(s).`
      : `Added ${Number(action.payload?.quantity) || 0} tablet(s) to ${actualMedicineName} stock. Current stock is ${Number(data.currentQuantity) || 0}.`
    : `${action.summary} Done.`;

  return {
    status: 'completed',
    action,
    data,
    navigation,
    answer: `${completedSummary} I will take you to the affected screen now.`,
  };
};

const buildConfirmationAnswer = (action) =>
  `${action.summary} Please confirm before I make this change. Reply "yes" to continue or "cancel" to stop.`;

module.exports = {
  buildConfirmationAnswer,
  executeAgenticAction,
  isCancelMessage,
  isConfirmMessage,
  parseAgenticAction,
};
