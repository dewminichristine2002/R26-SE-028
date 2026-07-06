import axios from 'axios';
import { API_BASE_URL } from './apiConfig';
import { getAuthHeaders } from './authService';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

/**
 * Sends a prescription photo to the backend for OCR.
 * @param {string} imageUri Local file URI from expo-image-picker
 * @param {string} [mimeType]
 * @returns {Promise<{ rawText: string, confidence: number, message?: string, preprocessing?: { applied?: string[] } }>}
 */
export async function extractPrescriptionTextFromImage(imageUri, mimeType = 'image/jpeg') {
  const headers = await getAuthHeaders();
  const form = new FormData();
  const name = mimeType.includes('png') ? 'prescription.png' : 'prescription.jpg';
  form.append('image', {
    uri: imageUri,
    name,
    type: mimeType,
  });

  const { data } = await client.post('/prescriptions/ocr', form, {
    headers: {
      ...headers,
    },
    maxBodyLength: 20 * 1024 * 1024,
    maxContentLength: 20 * 1024 * 1024,
  });

  return {
    rawText: typeof data.rawText === 'string' ? data.rawText : '',
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    message: data.message,
    preprocessing: data.preprocessing,
  };
}
