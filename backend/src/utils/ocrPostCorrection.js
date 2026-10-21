/**
 * Common OCR misreads on prescription text (proposal Phase 3, step 3).
 */
const CHARACTER_REPLACEMENTS = [
  [/0(?=[a-zA-Z])/g, 'O'],
  [/O(?=\d)/g, '0'],
  [/(?<=\d)l(?=[a-zA-Z])/g, '1'],
  [/(?<=[a-zA-Z])l(?=\d)/g, '1'],
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/cl/g, 'd'],
];

const TOKEN_CORRECTIONS = new Map([
  ['amoxiciilin', 'amoxicillin'],
  ['amoxicilin', 'amoxicillin'],
  ['ibupr0fen', 'ibuprofen'],
  ['paracetam0l', 'paracetamol'],
  ['metf0rmin', 'metformin'],
  ['warfar1n', 'warfarin'],
  ['omepraz0le', 'omeprazole'],
  ['atorvastatin', 'atorvastatin'],
  ['losartan', 'losartan'],
  ['bd', 'BD'],
  ['tds', 'TDS'],
  ['od', 'OD'],
]);

const correctOcrText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') {
    return { text: '', corrections: [] };
  }

  let text = rawText.replace(/\r\n/g, '\n');
  const corrections = [];

  for (const [pattern, replacement] of CHARACTER_REPLACEMENTS) {
    const before = text;
    text = text.replace(pattern, replacement);
    if (text !== before) {
      corrections.push(`pattern:${String(pattern)}→${replacement}`);
    }
  }

  const lines = text.split('\n').map((line) => {
    const tokens = line.split(/\s+/).map((token) => {
      const lower = token.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (TOKEN_CORRECTIONS.has(lower)) {
        const fixed = TOKEN_CORRECTIONS.get(lower);
        if (fixed !== token) {
          corrections.push(`${token}→${fixed}`);
        }
        return fixed;
      }
      return token;
    });
    return tokens.join(' ');
  });

  return {
    text: lines.join('\n').trim(),
    corrections: [...new Set(corrections)],
  };
};

module.exports = {
  correctOcrText,
};
