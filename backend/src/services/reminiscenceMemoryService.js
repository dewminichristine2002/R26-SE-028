/**
 * Consent-based personalized reminiscence memory profile.
 *
 * - Derives structured SAFE memory topics (never raw private transcripts)
 *   from a shared memory using deterministic keyword matching. No LLM.
 * - Stores a topic ONLY after the elder explicitly consents.
 * - Generates future prompts from curated templates per topic type.
 * - Prefers recently-unused consented topics; falls back to generic prompts.
 *
 * Storage policy (documented for privacy review):
 * Stored:     topic_type, optional short topic_label, optional short safe
 *             detail (<=120 chars, derived from the matched everyday keyword),
 *             source activity code, consent timestamp, usage timestamps.
 * NOT stored: passwords, financial details, medical information, full
 *             emotional transcripts, photo images or biometric data.
 */

const TOPIC_RULES = Object.freeze([
  { type: 'garden', label: 'gardening', keywords: ['garden', 'gardening', 'plant', 'flower', 'rose', 'orchid', 'vegetable patch', 'trees'] },
  { type: 'music', label: 'music', keywords: ['song', 'songs', 'music', 'singing', 'sang', 'melody', 'radio', 'hymn', 'lullaby', 'piano', 'violin', 'drum'] },
  { type: 'cooking', label: 'cooking', keywords: ['cook', 'cooking', 'bake', 'baking', 'kitchen', 'recipe', 'meal', 'curry', 'cake', 'tea'] },
  { type: 'pet', label: 'pets', keywords: ['dog', 'dogs', 'cat', 'cats', 'pet', 'bird', 'rabbit', 'puppy', 'kitten'] },
  { type: 'travel', label: 'travel', keywords: ['trip', 'travel', 'journey', 'train', 'flight', 'holiday away', 'tour', 'vacation', 'abroad'] },
  { type: 'celebration', label: 'celebration', keywords: ['wedding', 'birthday', 'festival', 'celebration', 'new year', 'christmas', 'diwali', 'party', 'anniversary'] },
  { type: 'family', label: 'family gathering', keywords: ['family', 'children', 'child', 'grandchild', 'grandchildren', 'grandson', 'granddaughter', 'brother', 'sister', 'mother', 'father', 'parents', 'husband', 'wife', 'son', 'daughter'] },
  { type: 'work', label: 'work memory', keywords: ['work', 'working', 'job', 'office', 'career', 'colleague', 'teacher', 'nurse', 'farm', 'shop', 'factory'] },
  { type: 'place', label: 'favorite place', keywords: ['beach', 'lake', 'river', 'mountain', 'village', 'temple', 'park', 'hometown', 'home town', 'house', 'sea', 'island'] },
  { type: 'hobby', label: 'old hobby', keywords: ['knitting', 'sewing', 'reading', 'book', 'books', 'fishing', 'craft', 'painting', 'drawing', 'chess', 'cards', 'walking', 'stitching', 'embroidery'] },
]);

const GENERIC_PROMPTS = Object.freeze([
  'Would you like to remember something pleasant from your past?',
  'Is there a moment you enjoyed that you would like to talk about?',
  'Would you like to share a memory that makes you smile?',
]);

const PROMPT_TEMPLATES = Object.freeze({
  garden: {
    withLabel: 'Would you like to remember a garden or plant you enjoyed caring for?',
    withoutLabel: 'Would you like to remember a garden or a plant you once cared for?',
  },
  music: {
    withLabel: 'Is there a song or kind of music that brings back a pleasant memory?',
    withoutLabel: 'Would you like to remember a song or kind of music you enjoyed?',
  },
  cooking: {
    withLabel: 'Would you like to remember a meal or recipe you enjoyed making?',
    withoutLabel: 'Would you like to remember a meal you enjoyed preparing?',
  },
  pet: {
    withLabel: 'Would you like to remember a pet that was special to you?',
    withoutLabel: 'Would you like to remember an animal that was special to you?',
  },
  travel: {
    withLabel: 'Would you like to remember a trip or journey you enjoyed?',
    withoutLabel: 'Would you like to remember a journey you once took?',
  },
  celebration: {
    withLabel: 'Would you like to remember a celebration that made you happy?',
    withoutLabel: 'Would you like to remember a happy celebration from your past?',
  },
  family: {
    withLabel: 'Would you like to remember a special time with your family?',
    withoutLabel: 'Would you like to remember a moment with someone close to you?',
  },
  work: {
    withLabel: 'Would you like to remember something from your working life?',
    withoutLabel: 'Would you like to remember a day from your working life?',
  },
  place: {
    withLabel: 'Would you like to remember a favorite place that feels comforting?',
    withoutLabel: 'Would you like to remember a place that feels comforting?',
  },
  hobby: {
    withLabel: 'Would you like to remember a hobby you enjoyed doing?',
    withoutLabel: 'Would you like to remember something you enjoyed doing often?',
  },
});

const MAX_SAFE_DETAIL_LENGTH = 120;

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

/**
 * Deterministically derive a safe topic from shared memory text.
 * Returns null when no known everyday topic is recognized — nothing is then
 * stored even with consent.
 */
function deriveMemoryTopic(memoryText) {
  const text = normalizeText(memoryText);
  if (!text.trim()) return null;
  for (const rule of TOPIC_RULES) {
    const matched = rule.keywords.find((keyword) => text.includes(keyword));
    if (matched) {
      return {
        topic_type: rule.type,
        topic_label: rule.label,
        // The safe detail is only the matched everyday keyword itself —
        // never the surrounding private narrative.
        safe_detail: String(matched).slice(0, MAX_SAFE_DETAIL_LENGTH),
      };
    }
  }
  return null;
}

/** Curated deterministic prompt for a stored topic. */
function buildTopicPrompt(topic) {
  if (!topic?.topic_type) return null;
  const template = PROMPT_TEMPLATES[topic.topic_type];
  if (!template) return null;
  return topic.topicLabel ? template.withLabel : template.withoutLabel;
}

/** Generic fallback prompt used when no consented topics are available. */
function buildGenericPrompt(seed = 0) {
  const index = Math.abs(Number(seed) || 0) % GENERIC_PROMPTS.length;
  return GENERIC_PROMPTS[index];
}

module.exports = {
  GENERIC_PROMPTS,
  PROMPT_TEMPLATES,
  TOPIC_RULES,
  buildGenericPrompt,
  buildTopicPrompt,
  deriveMemoryTopic,
};