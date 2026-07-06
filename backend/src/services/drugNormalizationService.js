const RXNORM_SEARCH_URL = 'https://rxnav.nlm.nih.gov/REST/rxcui.json';
const RXNORM_RELATED_URL = 'https://rxnav.nlm.nih.gov/REST/rxcui';

const CACHE_MAX_ENTRIES = Number(process.env.RXNORM_CACHE_MAX || 2000);
const REQUEST_TIMEOUT_MS = Number(process.env.RXNORM_TIMEOUT_MS || 8000);

/** @type {Map<string, { ingredientName: string, rxcui: string | null, source: string }>} */
const cache = new Map();

const normalizeQuery = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/gi, ' ')
    .replace(/\b(?:oral|tablet|capsule|solution|syrup|injection)\b/gi, ' ')
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const prepareSearchQuery = (rawName) => {
  const normalized = normalizeQuery(rawName);
  if (!normalized) {
    return '';
  }
  const words = normalized.split(' ').filter(Boolean);
  return words.slice(0, Math.min(3, words.length)).join(' ');
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`RxNorm HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

const extractIngredientName = (relatedPayload) => {
  const groups = relatedPayload?.relatedGroup?.conceptGroup;
  if (!Array.isArray(groups)) {
    return null;
  }
  const ingredientGroup = groups.find((group) => group.tty === 'IN');
  const name = ingredientGroup?.conceptProperties?.[0]?.name;
  return name ? String(name).trim().toLowerCase() : null;
};

const rxNormLookup = async (rawName) => {
  const query = prepareSearchQuery(rawName);
  if (!query) {
    return { ingredientName: normalizeQuery(rawName), rxcui: null, source: 'fallback' };
  }

  const searchUrl = `${RXNORM_SEARCH_URL}?name=${encodeURIComponent(query)}&search=2`;
  const searchData = await fetchJson(searchUrl);
  const rxcui = searchData?.idGroup?.rxnormId?.[0];
  if (!rxcui) {
    return { ingredientName: query, rxcui: null, source: 'fallback' };
  }

  const relatedUrl = `${RXNORM_RELATED_URL}/${encodeURIComponent(rxcui)}/related.json?tty=IN`;
  const relatedData = await fetchJson(relatedUrl);
  const ingredientName = extractIngredientName(relatedData);

  return {
    ingredientName: ingredientName || query,
    rxcui: String(rxcui),
    ingredientRxcui: relatedData?.relatedGroup?.conceptGroup
      ?.find((group) => group.tty === 'IN')
      ?.conceptProperties?.[0]?.rxcui || null,
    source: ingredientName ? 'rxnorm' : 'fallback',
  };
};

const rememberCache = (key, value) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
};

const isRxNormEnabled = () => {
  const flag = String(process.env.RXNORM_API_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(flag);
};

/**
 * Resolve a brand or trade name to its RxNorm ingredient (IN) via the public RxNorm REST API.
 * Fallback chain: cache → RxNorm API → cleaned raw name.
 */
const canonicalizeDrugName = async (rawName) => {
  const query = prepareSearchQuery(rawName);
  if (!query) {
    return {
      ingredientName: '',
      rxcui: null,
      ingredientRxcui: null,
      source: 'empty',
      originalInput: rawName,
    };
  }

  if (cache.has(query)) {
    return { ...cache.get(query), source: 'cache', originalInput: rawName };
  }

  if (!isRxNormEnabled()) {
    const fallback = { ingredientName: query, rxcui: null, ingredientRxcui: null, source: 'disabled' };
    rememberCache(query, fallback);
    return { ...fallback, originalInput: rawName };
  }

  try {
    const result = await rxNormLookup(rawName);
    const cached = {
      ingredientName: result.ingredientName,
      rxcui: result.rxcui,
      ingredientRxcui: result.ingredientRxcui || null,
      source: result.source,
    };
    rememberCache(query, cached);
    return { ...cached, originalInput: rawName };
  } catch (error) {
    console.warn(`[RxNorm] Lookup failed for "${rawName}": ${error.message}`);
    const fallback = { ingredientName: query, rxcui: null, ingredientRxcui: null, source: 'fallback' };
    rememberCache(query, fallback);
    return { ...fallback, originalInput: rawName };
  }
};

const clearNormalizationCache = () => {
  cache.clear();
};

module.exports = {
  canonicalizeDrugName,
  clearNormalizationCache,
  normalizeQuery,
  prepareSearchQuery,
};
