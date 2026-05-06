const FREQ_MAP = {
  bd: 'twice daily (bd)',
  bid: 'twice daily (bid)',
  tds: 'three times daily (tds)',
  tid: 'three times daily (tid)',
  od: 'once daily',
  qid: 'four times daily',
  prn: 'as needed (prn)',
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
  const line = text.split(/\n/).map((l) => l.trim()).find(Boolean) || text;
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
