const FREQ_MAP = {
  bd: 'twice daily (bd)',
  bid: 'twice daily (bid)',
  tds: 'three times daily (tds)',
  tid: 'three times daily (tid)',
  od: 'once daily',
  qid: 'four times daily',
  prn: 'as needed (prn)',
};

const HEADER_PATTERNS = [
  /\bpatient\b/i,
  /\bdoctor\b/i,
  /\bdate\b/i,
  /\bage\b/i,
  /\bsex\b/i,
  /\bname\b/i,
  /\breg\b/i,
  /\bmbbs\b/i,
  /\bmd\b/i,
  /\bsignature\b/i,
  /^\s*rx\s*$/i,
];

const MEDICINE_PREFIX_PATTERN =
  /^\s*(?:\d+[\).:-]?\s*)?(?:tab(?:let)?|cap(?:sule)?|syp|syrup|inj(?:ection)?|cream|ointment|drops?)\.?\s+/i;

const INSTRUCTION_ONLY_PATTERN =
  /^(?:od|bd|bid|tds|tid|qid|prn|once daily|daily|twice daily|three times(?: a day)?|four times(?: a day)?|after food|before food|before breakfast|after breakfast|after dinner|at night|morning|evening)\b/i;

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeMedicineLine = (line) =>
  normalizeWhitespace(
    String(line || '')
      .replace(/^[\s\-_.:,;]+/, '')
      .replace(/^\d+\s*[\).:-]?\s*/, '')
      .replace(MEDICINE_PREFIX_PATTERN, '')
      .replace(/\s*[-,:;]\s*/g, ' ')
  );

const hasLetters = (value) => /[a-z]/i.test(String(value || ''));

const countWords = (value) =>
  normalizeWhitespace(value)
    .split(' ')
    .filter(Boolean).length;

const looksLikeHeaderLine = (line) => HEADER_PATTERNS.some((pattern) => pattern.test(String(line || '').trim()));

const looksLikeInstructionOnlyLine = (line) => {
  const value = normalizeMedicineLine(line).toLowerCase();
  if (!value) {
    return false;
  }
  if (INSTRUCTION_ONLY_PATTERN.test(value)) {
    return true;
  }
  return !/\b[a-z]{4,}\b/i.test(value) && /\b(after|before|daily|night|morning|evening|food|times?|od|bd|tds|tid|prn)\b/i.test(value);
};

export function parsePregnancyFromChronic(chronicDiseasesText) {
  const lines = String(chronicDiseasesText || '').split('\n');
  if (!lines.length) {
    return { pregnancy: '', chronicRest: '' };
  }
  const first = lines[0];
  if (/^pregnancy:\s*/i.test(first)) {
    return {
      pregnancy: first.replace(/^pregnancy:\s*/i, '').trim(),
      chronicRest: lines.slice(1).join('\n').trim(),
    };
  }
  return { pregnancy: '', chronicRest: String(chronicDiseasesText || '').trim() };
}

export function mergeChronicWithPregnancy(chronicBody, pregnancy, gender) {
  const skip = !pregnancy || pregnancy === 'Not applicable';
  const applicable = gender === 'Female' && !skip;
  const line = applicable ? `Pregnancy: ${pregnancy}` : '';
  return [line, String(chronicBody || '').trim()].filter(Boolean).join('\n');
}

export function extractMedicineFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return { medicineName: '', dose: '', frequency: '', displayFrequency: '' };
  }
  const line = normalizeMedicineLine(text.split(/\n/).map((l) => l.trim()).find(Boolean) || text);
  const doseMatch = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml)\b/i);
  const lower = line.toLowerCase();
  let freqKey = '';
  let displayFrequency = '';
  if (/\b(bd|b\.i\.d\.)\b/i.test(line)) {
    freqKey = 'bd';
  } else if (/\b(bid)\b/i.test(lower)) {
    freqKey = 'bid';
  } else if (/\b(tds|t\.i\.d\.)\b/i.test(line)) {
    freqKey = 'tds';
  } else if (/\b(tid)\b/i.test(lower)) {
    freqKey = 'tid';
  } else if (/\b(qid)\b/i.test(lower)) {
    freqKey = 'qid';
  } else if (/\b(prn)\b/i.test(lower)) {
    freqKey = 'prn';
  } else if (/\b(od|once daily|daily)\b/i.test(lower)) {
    freqKey = 'od';
  } else if (/twice\s+daily|two\s+times/i.test(lower)) {
    freqKey = 'bd';
  } else if (/three\s+times/i.test(lower)) {
    freqKey = 'tds';
  }
  if (freqKey) {
    displayFrequency = FREQ_MAP[freqKey] || freqKey;
  }
  let namePart = line
    .replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, ' ')
    .replace(/\b(bd|b\.i\.d\.|bid|tds|t\.i\.d\.|tid|od|once|daily|prn|qid|q6h|twice\s+daily|three\s+times\s+a\s+day|two\s+times\s+a\s+day)\b/gi, ' ')
    .replace(/\b(after|before|food|breakfast|lunch|dinner|night|morning|evening|bedtime|needed|when)\b/gi, ' ')
    .replace(/[,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!namePart) {
    namePart = line;
  }
  return {
    medicineName: namePart,
    dose: doseMatch ? `${doseMatch[1]} ${doseMatch[2].toLowerCase()}` : '',
    frequency: freqKey || displayFrequency || '',
    displayFrequency: displayFrequency || freqKey || '',
  };
}

export function extractMedicinesFromPrescriptionText(raw) {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const candidates = [];

  lines.forEach((line) => {
    if (looksLikeHeaderLine(line)) {
      return;
    }

    if (looksLikeInstructionOnlyLine(line)) {
      const parsedInstruction = extractMedicineFromText(line);
      const previous = candidates[candidates.length - 1];
      if (previous && parsedInstruction.displayFrequency && !previous.frequency) {
        previous.frequency = parsedInstruction.displayFrequency;
      }
      return;
    }

    const parsed = extractMedicineFromText(line);
    const medicineName = normalizeWhitespace(parsed.medicineName);

    if (!hasLetters(medicineName)) {
      return;
    }

    const normalizedName = medicineName.toLowerCase();
    const wordCount = countWords(medicineName);
    const looksUseful =
      parsed.dose ||
      parsed.displayFrequency ||
      wordCount >= 1 ||
      /\b[a-z]{4,}\b/i.test(medicineName);

    if (!looksUseful) {
      return;
    }

    const candidate = {
      sourceLine: normalizeWhitespace(line),
      medicineName,
      normalizedDrugName: normalizedName,
      dose: parsed.dose,
      frequency: parsed.displayFrequency || parsed.frequency || '',
    };

    const existing = candidates.find(
      (item) =>
        item.normalizedDrugName === candidate.normalizedDrugName &&
        item.dose === candidate.dose &&
        item.frequency === candidate.frequency
    );

    if (!existing) {
      candidates.push(candidate);
    }
  });

  return candidates.slice(0, 8);
}

export function interactionSeverityUserLabel(apiSeverity) {
  const s = String(apiSeverity || '').toLowerCase();
  if (s === 'high') return 'Major';
  if (s === 'medium') return 'Moderate';
  if (s === 'low') return 'Minor';
  return 'None';
}

export function cleanExplanationText(text) {
  if (!text) return 'No explanation available.';
  return String(text)
    .replace(/The baseline ML model also estimated [^.]+ reaction risk\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
