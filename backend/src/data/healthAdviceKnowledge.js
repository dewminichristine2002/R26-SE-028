const EMBEDDING_DIMENSIONS = 64;

const STOP_WORDS = new Set([
  'a',
  'about',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'for',
  'from',
  'have',
  'if',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
  'you',
  'your',
]);

const TRUSTED_HEALTH_ADVICE_CHUNKS = [
  {
    sourceName: 'WHO Noncommunicable Diseases',
    sourceUrl: 'https://www.who.int/news-room/fact-sheets/detail/noncommunicable-diseases',
    riskType: 'General',
    topic: 'Shared NCD risk factors',
    contentChunk: 'WHO identifies tobacco use, physical inactivity, unhealthy diets, harmful alcohol use, and air pollution as risk factors that increase noncommunicable disease risk. These behaviors can contribute to raised blood pressure, overweight or obesity, raised blood glucose, and abnormal blood lipids.',
  },
  {
    sourceName: 'WHO NCD Risk Factors and Conditions',
    sourceUrl: 'https://www.who.int/data/gho/data/themes/topics/noncommunicable-diseases-risk-factors',
    riskType: 'General',
    topic: 'Metabolic risk factors',
    contentChunk: 'WHO describes common preventable NCD risks as tobacco use, physical inactivity, unhealthy diet, and harmful alcohol use. These can lead to raised blood pressure, overweight or obesity, raised blood glucose, and raised cholesterol.',
  },
  {
    sourceName: 'Sri Lanka NCD Unit',
    sourceUrl: 'https://www.ncd.health.gov.lk/index.php?lang=en',
    riskType: 'General',
    topic: 'Sri Lanka local NCD prevention context',
    contentChunk: 'The Sri Lanka NCD Unit highlights shared chronic NCD risk factors including smoking and tobacco use, unhealthy diet, physical inactivity, harmful alcohol use, and stress. Local prevention work includes tobacco cessation, physical activity promotion, healthy diet promotion, healthy lifestyle centers, and standardizing NCD management.',
  },
  {
    sourceName: 'CDC Diabetes Risk Factors',
    sourceUrl: 'https://www.cdc.gov/diabetes/risk-factors/index.html',
    riskType: 'Diabetes',
    topic: 'Diabetes risk factors',
    contentChunk: 'CDC lists type 2 diabetes and prediabetes risk factors such as overweight or obesity, age 45 or older, having a parent or sibling with type 2 diabetes, and being physically active less than three times a week. Some risk factors cannot be changed, but behavior changes can reduce risk.',
  },
  {
    sourceName: 'CDC Diabetes Risk Factors',
    sourceUrl: 'https://www.cdc.gov/diabetes/risk-factors/index.html',
    riskType: 'Diabetes',
    topic: 'Physical activity healthy eating and weight',
    contentChunk: 'CDC says behavior changes that may lower risk of prediabetes, type 2 diabetes, or gestational diabetes include increasing physical activity, eating a healthy diet, and losing weight if a person has overweight or obesity. Small gradual changes can help overall health.',
  },
  {
    sourceName: 'CDC Diabetes Basics',
    sourceUrl: 'https://www.cdc.gov/diabetes/about/index.html',
    riskType: 'Diabetes',
    topic: 'Blood sugar and health appointments',
    contentChunk: 'CDC explains that diabetes affects how the body turns food into energy and that too much blood sugar can stay in the bloodstream. CDC also emphasizes getting blood sugar tested when at risk, making and keeping health care appointments, and taking prescribed medicine as directed.',
  },
  {
    sourceName: 'CDC Diabetes Basics',
    sourceUrl: 'https://www.cdc.gov/diabetes/about/index.html',
    riskType: 'Diabetes',
    topic: 'Type 2 diabetes prevention',
    contentChunk: 'CDC says prediabetes and type 2 diabetes can be prevented or delayed with lifestyle changes such as losing weight if overweight, eating a healthy diet, and getting regular physical activity. People at risk should discuss testing and support with a health professional.',
  },
  {
    sourceName: 'CDC Stroke Risk Factors',
    sourceUrl: 'https://www.cdc.gov/stroke/risk-factors/index.html',
    riskType: 'Stroke',
    topic: 'Medical stroke risk factors',
    contentChunk: 'CDC says common medical conditions can increase stroke risk, including high blood pressure, high cholesterol, diabetes, obesity, and heart disease. High blood pressure is a leading cause of stroke and often has no symptoms, so regular checks and professional follow-up matter.',
  },
  {
    sourceName: 'CDC Stroke Risk Factors',
    sourceUrl: 'https://www.cdc.gov/stroke/risk-factors/index.html',
    riskType: 'Stroke',
    topic: 'Lifestyle stroke risk factors',
    contentChunk: 'CDC says lifestyle choices can increase stroke risk, including diets high in saturated fat, trans fat, cholesterol, or sodium, not getting enough physical activity, drinking too much alcohol, and tobacco use. Healthy behaviors can help lower stroke risk.',
  },
  {
    sourceName: 'CDC Stroke Prevention',
    sourceUrl: 'https://www.cdc.gov/stroke/prevention/index.html',
    riskType: 'Stroke',
    topic: 'Healthy eating and healthy weight',
    contentChunk: 'CDC recommends healthy lifestyle choices to help prevent stroke, including eating plenty of fruits and vegetables, choosing foods low in saturated fat, trans fat, and cholesterol, limiting sodium to help lower blood pressure, and keeping a healthy weight.',
  },
  {
    sourceName: 'CDC Stroke Prevention',
    sourceUrl: 'https://www.cdc.gov/stroke/prevention/index.html',
    riskType: 'Stroke',
    topic: 'Physical activity for stroke prevention',
    contentChunk: 'CDC says physical activity can help people stay at a healthy weight and lower cholesterol and blood pressure levels. Adults are encouraged to get regular moderate-intensity aerobic activity such as brisk walking when it is safe for them.',
  },
  {
    sourceName: 'CDC Stroke Prevention',
    sourceUrl: 'https://www.cdc.gov/stroke/prevention/index.html',
    riskType: 'Stroke',
    topic: 'Blood pressure diabetes medicine and care team',
    contentChunk: 'CDC recommends working with a health care team to control conditions that raise stroke risk, including high blood pressure, high cholesterol, and diabetes. CDC says to follow doctor instructions for medicines and never stop medicine without first talking to a doctor or pharmacist.',
  },
  {
    sourceName: 'CDC High Blood Pressure Risk Factors',
    sourceUrl: 'https://www.cdc.gov/high-blood-pressure/risk-factors/index.html',
    riskType: 'Hypertension',
    topic: 'High blood pressure risk factors',
    contentChunk: 'CDC says physical inactivity, unhealthy diet, diabetes, drinking too much alcohol, tobacco use, family history, age, and other characteristics can increase high blood pressure risk. Some risk factors cannot be controlled, but people can change factors such as activity, diet, tobacco, and alcohol.',
  },
  {
    sourceName: 'CDC High Blood Pressure Risk Factors',
    sourceUrl: 'https://www.cdc.gov/high-blood-pressure/risk-factors/index.html',
    riskType: 'Hypertension',
    topic: 'Diet sodium and physical activity',
    contentChunk: 'CDC says a diet too high in sodium and too low in potassium can increase high blood pressure risk. Regular physical activity helps the heart and blood vessels stay strong and healthy and may help lower blood pressure and support healthy weight.',
  },
  {
    sourceName: 'CDC High Blood Pressure Risk Factors',
    sourceUrl: 'https://www.cdc.gov/high-blood-pressure/risk-factors/index.html',
    riskType: 'Hypertension',
    topic: 'Diabetes obesity and family history',
    contentChunk: 'CDC says diabetes and obesity can increase high blood pressure risk. High blood pressure can run in families, and risk can increase when family history combines with unhealthy lifestyle choices such as smoking or an unhealthy diet.',
  },
  {
    sourceName: 'American Heart Association Home Blood Pressure Monitoring',
    sourceUrl: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home',
    riskType: 'Hypertension',
    topic: 'Home blood pressure monitoring safety',
    contentChunk: 'The American Heart Association recommends home monitoring for people with high blood pressure to help health care professionals know whether treatment is working. Home monitoring does not replace regular doctor visits, and users should not stop blood pressure medication without checking with a health care professional.',
  },
  {
    sourceName: 'American Heart Association Home Blood Pressure Monitoring',
    sourceUrl: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home',
    riskType: 'Hypertension',
    topic: 'Accurate home blood pressure readings',
    contentChunk: 'The American Heart Association recommends an automatic cuff-style upper arm monitor, correct cuff size, quiet rest before measuring, taking readings at the same time each day, taking multiple readings, recording results, and bringing the monitor to medical appointments to check accuracy.',
  },
  {
    sourceName: 'American Heart Association Home Blood Pressure Monitoring',
    sourceUrl: 'https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home',
    riskType: 'Hypertension',
    topic: 'Very high blood pressure readings',
    contentChunk: 'The American Heart Association says severe blood pressure readings should be discussed with a health care professional, and very high readings with symptoms such as chest pain, shortness of breath, numbness, weakness, vision changes, or trouble speaking need emergency help.',
  },
];

const normalizeToken = (token) => token
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')
  .replace(/(ing|ed|es|s)$/i, '');

const hashToken = (token) => {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const tokenize = (text) => String(text || '')
  .split(/[^a-zA-Z0-9]+/)
  .map(normalizeToken)
  .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

const embedText = (text) => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  for (const token of tokenize(text)) {
    const index = hashToken(token) % EMBEDDING_DIMENSIONS;
    vector[index] += 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!norm) {
    return vector;
  }
  return vector.map((value) => Number((value / norm).toFixed(6)));
};

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const chunkSearchText = (chunk) => [
  chunk.riskType,
  chunk.topic,
  chunk.sourceName,
  chunk.contentChunk,
].join(' ');

const chunksWithEmbeddings = () => TRUSTED_HEALTH_ADVICE_CHUNKS.map((chunk) => ({
  ...chunk,
  embedding: embedText(chunkSearchText(chunk)),
}));

module.exports = {
  EMBEDDING_DIMENSIONS,
  TRUSTED_HEALTH_ADVICE_CHUNKS,
  chunkSearchText,
  chunksWithEmbeddings,
  cosineSimilarity,
  embedText,
  tokenize,
};
