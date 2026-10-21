import axios from 'axios';

const OCR_ENDPOINT = 'https://api.ocr.space/parse/image';
const OCR_API_KEY = 'helloworld';

const cleanLine = (line = '') => String(line).replace(/\s+/g, ' ').trim();
const noiseLineRegex = /invoice|receipt|pharmacy|total|subtotal|discount|tax|cash|card|date|time|address|phone|contact|amount|balance|thank\s*you/i;

const extractMedicineName = (lines) => {
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) {
      continue;
    }

    if (/tablet|capsule|syrup|mg|ml/i.test(line) && /[a-z]/i.test(line)) {
      const nameOnly = line
        .replace(/\b\d+(?:\.\d+)?\s*(mg|ml)\b/gi, '')
        .replace(/\b(tablet|tablets|capsule|capsules|syrup)\b/gi, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim();

      if (nameOnly.length >= 3) {
        return nameOnly;
      }
    }
  }

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (/^[a-z][a-z0-9\s-]{2,}$/i.test(line) && !/invoice|receipt|pharmacy|total|date/i.test(line)) {
      return line;
    }
  }

  return '';
};

const extractDoseMgFromText = (text) => {
  const match = String(text || '').match(/(\d+(?:\.\d+)?)\s*mg\b/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const extractQtyFromText = (text) => {
  const source = String(text || '');
  const normalized = source
    .replace(/\b\d+(?:\.\d+)?\s*(mg|ml)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const explicitMatch = source.match(/(?:qty|quantity|q\.?ty)\s*[:\-]?\s*(\d{1,4})/i);
  if (explicitMatch) {
    const value = Number(explicitMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const unitsMatch = source.match(/(?:x|\b)(\d{1,4})\s*(?:tabs?|tablets?|capsules?|pcs?)\b/i);
  if (unitsMatch) {
    const value = Number(unitsMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const timesMatch = normalized.match(/(?:^|\s)x\s*(\d{1,4})(?=\s|$)/i);
  if (timesMatch) {
    const value = Number(timesMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  // Fallback: many receipts place quantity as the last number after medicine name.
  const trailingNumberMatch = normalized.match(/(?:^|\s)(\d{1,4})\s*$/);
  if (trailingNumberMatch) {
    const value = Number(trailingNumberMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
};

const sanitizeMedicineName = (text) => {
  return String(text || '')
    .replace(/\b\d+(?:\.\d+)?\s*mg\b/gi, '')
    .replace(/(?:qty|quantity|q\.?ty)\s*[:\-]?\s*\d{1,4}/gi, '')
    .replace(/\b\d{1,4}\s*(?:tabs?|tablets?|capsules?|pcs?)\b/gi, '')
    .replace(/\b(tablet|tablets|capsule|capsules|syrup|ml|mg)\b/gi, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractMedicinesList = (lines, fullText) => {
  const medicines = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanLine(lines[index]);
    if (!line || noiseLineRegex.test(line)) {
      continue;
    }

    const hasLetters = /[a-z]/i.test(line);
    const hasDose = /\d+(?:\.\d+)?\s*mg\b/i.test(line);
    const hasForm = /tablet|capsule|syrup|tabs?|pcs?/i.test(line);
    const hasQty = /(?:qty|quantity|q\.?ty|tabs?|tablets?|capsules?|pcs?)\b/i.test(line);

    if (!hasLetters || (!hasDose && !hasForm && !hasQty)) {
      continue;
    }

    const nextLine = lines[index + 1] || '';
    const mergedText = `${line} ${nextLine}`.trim();

    const medicineName = sanitizeMedicineName(line);
    if (!medicineName || medicineName.length < 3) {
      continue;
    }

    const doseInLine = extractDoseMgFromText(line) || extractDoseMgFromText(mergedText);
    const qtyInLine = extractQtyFromText(line) || extractQtyFromText(mergedText);

    if (!doseInLine && !qtyInLine) {
      continue;
    }

    const dosage = doseInLine || extractDoseMgFromText(fullText) || 20;
    const quantity = qtyInLine || 30;

    medicines.push({
      medicineName,
      dosageMg: String(Math.max(1, dosage)),
      totalQuantity: String(Math.max(1, quantity)),
      dailyAmount: '1',
    });
  }

  const unique = [];
  const seen = new Set();
  for (const item of medicines) {
    const key = `${item.medicineName.toLowerCase()}|${item.dosageMg}|${item.totalQuantity}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return unique;
};

const extractNumber = (text, regex, fallback = null) => {
  const match = String(text || '').match(regex);
  if (!match) {
    return fallback;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return value;
};

export const receiptOcrService = {
  async parseReceiptImage(uri) {
    if (!uri) {
      throw new Error('Image uri is required for OCR');
    }

    const formData = new FormData();
    formData.append('apikey', OCR_API_KEY);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('OCREngine', '2');
    formData.append('file', {
      uri,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    });

    const response = await axios.post(OCR_ENDPOINT, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    });

    const parsedText = response.data?.ParsedResults?.[0]?.ParsedText || '';
    if (!parsedText.trim()) {
      throw new Error('No readable text found in receipt image');
    }

    const lines = parsedText
      .split(/\r?\n/)
      .map((line) => cleanLine(line))
      .filter(Boolean);

    const medicines = extractMedicinesList(lines, parsedText);

    if (medicines.length) {
      return {
        rawText: parsedText,
        medicines,
        fields: medicines[0],
      };
    }

    const dosageMg = extractNumber(parsedText, /(\d+(?:\.\d+)?)\s*mg/i, 0);
    const totalQuantity =
      extractNumber(parsedText, /(?:qty|quantity|q\.?ty)\s*[:\-]?\s*(\d{1,4})/i, null) ||
      extractNumber(parsedText, /(?:tablets?|tabs?|capsules?)\s*[:\-]?\s*(\d{1,4})/i, 30) ||
      30;

    const dailyAmount =
      extractNumber(parsedText, /(?:daily|per\s*day|dose)\s*[:\-]?\s*(\d{1,2})/i, 1) ||
      1;

    return {
      rawText: parsedText,
      medicines: [],
      fields: {
        medicineName: extractMedicineName(lines),
        dosageMg: String(Math.max(1, Number(dosageMg) || 20)),
        totalQuantity: String(Math.max(1, Number(totalQuantity) || 30)),
        dailyAmount: String(Math.max(1, Number(dailyAmount) || 1)),
      },
    };
  },
};

export default receiptOcrService;
