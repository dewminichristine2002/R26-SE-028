import { API_BASE_URL, getApiBaseUrlCandidates } from './apiConfig';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OCR_TIMEOUT_MS = 120000;

const normalizeMimeType = (mimeType, imageUri) => {
  const explicit = String(mimeType || '').trim().toLowerCase();
  if (explicit.startsWith('image/')) {
    return explicit;
  }

  const lowerUri = String(imageUri || '').toLowerCase();
  if (lowerUri.endsWith('.png')) {
    return 'image/png';
  }
  if (lowerUri.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
};

const buildFileName = (mimeType) => {
  if (mimeType.includes('png')) {
    return 'prescription.png';
  }
  if (mimeType.includes('webp')) {
    return 'prescription.webp';
  }
  return 'prescription.jpg';
};

const buildFormData = (imageUri, mimeType) => {
  const form = new FormData();
  form.append('image', {
    uri: imageUri,
    name: buildFileName(mimeType),
    type: mimeType,
  });
  return form;
};

const makeTimeoutError = (baseURL) => {
  const error = new Error(`OCR request timed out for ${baseURL}`);
  error.code = 'OCR_TIMEOUT';
  return error;
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    return await fetch(url, {
      ...options,
      signal: controller?.signal,
    });
  } catch (error) {
    if (controller?.signal?.aborted) {
      throw makeTimeoutError(url);
    }
    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const shouldRetryResponseStatus = (status) => [408, 429, 502, 503, 504].includes(Number(status || 0));

const shouldTryAnotherBaseUrl = (errorOrStatus) => {
  const status =
    typeof errorOrStatus === 'number'
      ? errorOrStatus
      : Number(errorOrStatus?.status || errorOrStatus?.response?.status || 0);

  if (status) {
    return status === 404 || status === 408 || status === 502 || status === 503 || status === 504;
  }

  return true;
};

async function postOcrOnce(baseURL, imageUri, mimeType) {
  const response = await fetchWithTimeout(
    `${String(baseURL).replace(/\/+$/, '')}/prescriptions/ocr`,
    {
      method: 'POST',
      body: buildFormData(imageUri, mimeType),
      headers: {
        Accept: 'application/json',
      },
    },
    OCR_TIMEOUT_MS
  );

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `OCR request failed with status ${response.status}`);
    error.status = response.status;
    error.response = {
      status: response.status,
      data: data || {},
    };
    throw error;
  }

  return {
    rawText: typeof data?.rawText === 'string' ? data.rawText : '',
    confidence: typeof data?.confidence === 'number' ? data.confidence : 0,
    message: data?.message,
    preprocessing: data?.preprocessing,
    matchedCandidates: Array.isArray(data?.matchedCandidates) ? data.matchedCandidates : [],
  };
}

/**
 * Sends a prescription photo to the backend for OCR.
 * @param {string} imageUri Local file URI from expo-image-picker
 * @param {string} [mimeType]
 * @returns {Promise<{ rawText: string, confidence: number, message?: string, preprocessing?: { applied?: string[] }, matchedCandidates?: Array<object> }>}
 */
export async function extractPrescriptionTextFromImage(imageUri, mimeType = 'image/jpeg') {
  const resolvedMimeType = normalizeMimeType(mimeType, imageUri);
  const baseUrls = getApiBaseUrlCandidates();
  let lastError;

  for (let baseIndex = 0; baseIndex < baseUrls.length; baseIndex += 1) {
    const baseURL = baseUrls[baseIndex];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await postOcrOnce(baseURL, imageUri, resolvedMimeType);
      } catch (error) {
        lastError = error;
        const status = Number(error?.response?.status || error?.status || 0);

        if (attempt < 2 && (error?.code === 'OCR_TIMEOUT' || shouldRetryResponseStatus(status))) {
          await sleep(800 * (attempt + 1));
          continue;
        }

        if (baseIndex < baseUrls.length - 1 && shouldTryAnotherBaseUrl(error)) {
          break;
        }

        throw error;
      }
    }
  }

  if (lastError && !lastError.response) {
    lastError.message = `${lastError.message || 'Network Error'} (tried: ${baseUrls.join(', ') || API_BASE_URL})`;
  }

  throw lastError;
}
