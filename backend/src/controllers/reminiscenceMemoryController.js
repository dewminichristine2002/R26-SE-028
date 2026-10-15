const repository = require('../repositories/reminiscenceMemoryRepository');
const entryRepository = require('../repositories/reminiscenceMemoryEntryRepository');
const {
  buildGenericPrompt,
  buildTopicPrompt,
  deriveMemoryTopic,
} = require('../services/reminiscenceMemoryService');

function validateUserId(userId) {
  return !Number.isInteger(userId) || userId <= 0;
}

function publicTopic(topic) {
  if (!topic) return null;
  return {
    id: topic.id,
    topic_type: topic.topicType,
    topic_label: topic.topicLabel,
    safe_detail: topic.safeDetail,
    source_activity_id: topic.sourceActivityId,
    created_at: topic.createdAt,
  };
}

/**
 * Preview the deterministic topic derivation for a shared memory.
 * Nothing is persisted here — consent is requested afterwards in the UI.
 */
async function previewTopic(req, res) {
  try {
    const memoryText = String(req.body?.memory_text || '').trim();
    if (!memoryText) {
      return res.status(400).json({ success: false, error: 'memory_text is required.' });
    }
    const derived = deriveMemoryTopic(memoryText);
    return res.json({ success: true, derived_topic: derived });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to derive a memory topic.' });
  }
}

/**
 * Save a consented reminiscence topic. Explicit consent is REQUIRED:
 * participation alone never implies consent.
 */
async function saveTopic(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const consent = req.body?.consent === true;
    const topicType = String(req.body?.topic_type || '').trim().toLowerCase();
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!consent) {
      // Hard gate: without an explicit consent signal nothing is stored.
      return res.status(403).json({
        success: false,
        error: 'Explicit consent is required before ElderMeds can remember a topic.',
      });
    }
    if (!topicType) {
      return res.status(400).json({ success: false, error: 'topic_type is required.' });
    }
    const safeDetail = String(req.body?.safe_detail || '').trim().slice(0, 120) || null;
    const topicLabel = String(req.body?.topic_label || '').trim().slice(0, 80) || null;
    const sourceActivityId = String(req.body?.source_activity_id || '').trim().slice(0, 80) || null;
    const topic = await repository.createTopic({
      userId,
      topicType,
      topicLabel,
      safeDetail,
      sourceActivityId,
    });
    return res.status(201).json({ success: true, topic: publicTopic(topic) });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to save the remembered topic.' });
  }
}

async function listTopics(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    const topics = await repository.listActiveTopics(userId);
    return res.json({ success: true, count: topics.length, topics: topics.map(publicTopic) });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to load remembered topics.' });
  }
}

async function deleteTopic(req, res) {
  try {
    const userId = Number(req.body?.user_id ?? req.query?.user_id);
    const topicId = String(req.params.topicId || '').trim();
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!topicId) {
      return res.status(400).json({ success: false, error: 'A topic id is required.' });
    }
    const removed = await repository.deactivateTopic(topicId, userId);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Remembered topic was not found.' });
    }
    return res.json({ success: true, removed_topic: publicTopic(removed) });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to remove the remembered topic.' });
  }
}

async function clearTopics(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    const removed = await repository.deactivateAllTopics(userId);
    return res.json({ success: true, removed_count: removed.length });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to clear remembered topics.' });
  }
}

/**
 * Serve the next reminiscence prompt: a curated template for the
 * least-recently-used consented topic, or a generic fallback when no
 * consented topics exist. Serving marks the topic as used so the same topic
 * is not repeated every session.
 */
async function getPrompt(req, res) {
  try {
    const userId = Number(req.params.userId);
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    const topic = await repository.selectNextPromptTopic(userId);
    if (topic) {
      const prompt = buildTopicPrompt(topic);
      if (prompt) {
        await repository.markTopicUsed(topic.id);
        return res.json({
          success: true,
          source: 'remembered_topic',
          prompt,
          topic: publicTopic(topic),
        });
      }
    }
    return res.json({
      success: true,
      source: 'generic',
      prompt: buildGenericPrompt(Date.now()),
      topic: null,
    });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to prepare a memory prompt.' });
  }
}

async function createEntry(req, res) {
  try {
    const userId = Number(req.body?.user_id);
    const entryType = String(req.body?.entry_type || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim().slice(0, 200);
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!entryType) {
      return res.status(400).json({ success: false, error: 'entry_type is required.' });
    }
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required.' });
    }
    const category = String(req.body?.category || '').trim().slice(0, 80) || null;
    const story = String(req.body?.story || '').trim() || null;
    const memoryDate = req.body?.memory_date || null; // accept ISO date or null
    // Photo handling: spec requires photo to be local-only; do not accept raw photo upload here.
    const photoReference = null;
    const consentStatus = req.body?.consent === true || false;

    const entry = await entryRepository.createEntry({
      userId,
      entryType,
      title,
      category,
      story,
      memoryDate,
      photoReference,
      consentStatus,
    });
    return res.status(201).json({ success: true, entry });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to save memory entry.' });
  }
}

async function listEntries(req, res) {
  try {
    const userId = Number(req.params.userId);
    const entryType = req.query?.entry_type ? String(req.query.entry_type).trim().toLowerCase() : null;
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    const entries = await entryRepository.listEntriesForUser(userId, entryType);
    return res.json({ success: true, count: entries.length, entries });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to load memory entries.' });
  }
}

async function deleteEntry(req, res) {
  try {
    const userId = Number(req.body?.user_id ?? req.query?.user_id);
    const entryId = String(req.params.entryId || '').trim();
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!entryId) {
      return res.status(400).json({ success: false, error: 'An entry id is required.' });
    }
    const removed = await entryRepository.deleteEntry(entryId, userId);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Memory entry was not found.' });
    }
    return res.json({ success: true, removed_entry: removed });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to remove the memory entry.' });
  }
}

module.exports = {
  clearTopics,
  deleteTopic,
  getPrompt,
  listTopics,
  previewTopic,
  saveTopic,
  createEntry,
  listEntries,
  deleteEntry,
};