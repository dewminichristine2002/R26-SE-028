const repository = require('../repositories/reminiscenceMemoryRepository');
const entryRepository = require('../repositories/reminiscenceMemoryEntryRepository');
const photoStorage = require('../services/reminiscencePhotoStorageService');
const {
  buildGenericPrompt,
  buildTopicPrompt,
  deriveMemoryTopic,
} = require('../services/reminiscenceMemoryService');

function validateUserId(userId) {
  return !Number.isInteger(userId) || userId <= 0;
}

function authorizeOwnUser(req, res, requestedUserId) {
  const authenticatedUserId = Number(req.user?.id);
  if (validateUserId(authenticatedUserId)) {
    res.status(401).json({ success: false, error: 'An authenticated user is required.' });
    return null;
  }
  if (requestedUserId !== authenticatedUserId) {
    res.status(403).json({ success: false, error: 'You can only access your own reminiscence data.' });
    return null;
  }
  return authenticatedUserId;
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

function publicMemoryEntry(entry) {
  if (!entry) return null;
  const { photoReference, ...safeEntry } = entry;
  return { ...safeEntry, photoSaved: Boolean(photoReference) };
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
    const userId = Number(req.body?.user_id ?? req.user?.id);
    const consent = req.body?.consent === true;
    const topicType = String(req.body?.topic_type || '').trim().toLowerCase();
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!authorizeOwnUser(req, res, userId)) return;
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
    if (!authorizeOwnUser(req, res, userId)) return;
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
    if (!authorizeOwnUser(req, res, userId)) return;
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
    if (!authorizeOwnUser(req, res, userId)) return;
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
    if (!authorizeOwnUser(req, res, userId)) return;
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
    const userId = Number(req.body?.user_id ?? req.user?.id);
    const entryType = String(req.body?.entry_type || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim().slice(0, 200);
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!authorizeOwnUser(req, res, userId)) return;
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

function photoErrorResponse(res, error) {
  const responses = {
    PHOTO_INVALID: [400, 'Choose a valid JPEG, PNG, or WebP image.'],
    PHOTO_TOO_LARGE: [413, 'Choose an image smaller than 8 MB.'],
    PHOTO_STORAGE_NOT_CONFIGURED: [503, 'Photo saving is not available yet. You can save this memory without the photo.'],
    PHOTO_ALREADY_EXISTS: [409, 'This photo save is already being processed. Please retry.'],
    PHOTO_NOT_FOUND: [404, 'The photo was not found.'],
    PHOTO_URL_FAILED: [503, 'The saved photo is temporarily unavailable.'],
  };
  const [status, message] = responses[error?.code] || [502, 'Private photo storage could not complete the request.'];
  return res.status(status).json({ success: false, error: message, code: error?.code || 'PHOTO_STORAGE_FAILED' });
}

async function createEntryWithPhoto(req, res) {
  let uploadedKey = null;
  try {
    const userId = Number(req.body?.user_id ?? req.user?.id);
    const entryType = String(req.body?.entry_type || '').trim().toLowerCase();
    const title = String(req.body?.title || '').trim().slice(0, 200);
    if (validateUserId(userId)) return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    if (!authorizeOwnUser(req, res, userId)) return;
    if (req.body?.consent !== 'true') return res.status(403).json({ success: false, error: 'Please agree to save this photo with your memory.' });
    if (!['life_book', 'good_deed'].includes(entryType)) return res.status(400).json({ success: false, error: 'A valid memory entry type is required.' });
    if (!title) return res.status(400).json({ success: false, error: 'title is required.' });
    if (!req.file?.buffer) return res.status(400).json({ success: false, error: 'Choose a photo before saving.' });
    const requestId = String(req.body?.photo_request_id || '');
    const upload = await photoStorage.uploadPhoto({ userId, requestId, buffer: req.file.buffer });
    uploadedKey = upload.objectKey;
    const existing = await entryRepository.findEntryByPhotoReference(userId, uploadedKey);
    if (existing) return res.status(200).json({ success: true, entry: publicMemoryEntry(existing), duplicate: true });
    const entry = await entryRepository.createEntry({
      userId,
      entryType,
      title,
      category: String(req.body?.category || '').trim().slice(0, 80) || null,
      story: String(req.body?.story || '').trim() || null,
      memoryDate: req.body?.memory_date || null,
      photoReference: uploadedKey,
      consentStatus: true,
    });
    return res.status(201).json({ success: true, entry: publicMemoryEntry(entry) });
  } catch (error) {
    if (uploadedKey) {
      // Compensate for an upload whose row could not be committed. A read-after-error
      // check avoids deleting an object if the database committed before a disconnect.
      try {
        const persisted = await entryRepository.findEntryByPhotoReference(Number(req.body?.user_id ?? req.user?.id), uploadedKey);
        if (!persisted) await photoStorage.deletePhoto(Number(req.body?.user_id ?? req.user?.id), uploadedKey);
      } catch (_) {
        // If the database outcome is unknown, leave the object for operator review
        // instead of risking a committed row that points to a deleted photo.
      }
    }
    if (error?.code) return photoErrorResponse(res, error);
    return res.status(500).json({ success: false, error: 'Could not save the memory with its photo. Retry the photo or save text only.' });
  }
}

async function listEntries(req, res) {
  try {
    const userId = Number(req.params.userId);
    const entryType = req.query?.entry_type ? String(req.query.entry_type).trim().toLowerCase() : null;
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!authorizeOwnUser(req, res, userId)) return;
    const entries = await entryRepository.listEntriesForUser(userId, entryType);
    const safeEntries = await Promise.all(entries.map(async (entry) => {
      const { photoReference, ...entryWithoutReference } = entry;
      const publicEntry = { ...entryWithoutReference, photoSaved: Boolean(photoReference) };
      if (!photoReference) return { ...publicEntry, photoUrl: null, photoUnavailable: false };
      try {
        return { ...publicEntry, photoUrl: await photoStorage.createSignedPhotoUrl(userId, photoReference), photoUnavailable: false };
      } catch (_) {
        return { ...publicEntry, photoUrl: null, photoUnavailable: true };
      }
    }));
    return res.json({ success: true, count: safeEntries.length, entries: safeEntries });
  } catch (_error) {
    return res.status(500).json({ success: false, error: 'Failed to load memory entries.' });
  }
}

async function getEntryPhotoUrl(req, res) {
  try {
    const userId = Number(req.query?.user_id ?? req.user?.id);
    if (validateUserId(userId)) return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    if (!authorizeOwnUser(req, res, userId)) return;
    const entry = await entryRepository.getEntryForUser(String(req.params.entryId || ''), userId);
    if (!entry?.photoReference) return res.status(404).json({ success: false, error: 'This memory has no saved photo.' });
    const photoUrl = await photoStorage.createSignedPhotoUrl(userId, entry.photoReference);
    return res.json({ success: true, photoUrl });
  } catch (error) {
    if (error?.code) return photoErrorResponse(res, error);
    return res.status(500).json({ success: false, error: 'The saved photo is temporarily unavailable.' });
  }
}

async function deleteEntry(req, res) {
  try {
    const userId = Number(req.body?.user_id ?? req.query?.user_id);
    const entryId = String(req.params.entryId || '').trim();
    if (validateUserId(userId)) {
      return res.status(400).json({ success: false, error: 'A valid user_id is required.' });
    }
    if (!authorizeOwnUser(req, res, userId)) return;
    if (!entryId) {
      return res.status(400).json({ success: false, error: 'An entry id is required.' });
    }
    const existing = await entryRepository.getEntryForUser(entryId, userId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Memory entry was not found.' });
    }
    let photoBackup = null;
    if (existing.photoReference) {
      try {
        photoBackup = await photoStorage.downloadPhoto(userId, existing.photoReference);
        await photoStorage.deletePhoto(userId, existing.photoReference);
      } catch (error) {
        if (error?.code !== 'PHOTO_NOT_FOUND') throw error;
      }
    }
    let removed;
    try {
      removed = await entryRepository.deleteEntry(entryId, userId);
    } catch (error) {
      if (photoBackup) {
        try { await photoStorage.uploadAtKey(userId, existing.photoReference, photoBackup.buffer, photoBackup.contentType); } catch (_) { /* Keep failure response generic; recovery may require operator review. */ }
      }
      throw error;
    }
    return res.json({ success: true, removed_entry: publicMemoryEntry(removed) });
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
  createEntryWithPhoto,
  listEntries,
  getEntryPhotoUrl,
  deleteEntry,
};
