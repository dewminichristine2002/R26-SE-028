const { query } = require('../db/postgres');

function mapEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    entryType: row.entryType,
    title: row.title,
    category: row.category || null,
    story: row.story || null,
    memoryDate: row.memoryDate || null,
    photoReference: row.photoReference || null,
    consentStatus: Boolean(row.consentStatus),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const publicColumns = `
  id, user_id AS "userId", entry_type AS "entryType", title, category,
  story, memory_date AS "memoryDate", photo_reference AS "photoReference",
  consent_status AS "consentStatus", created_at AS "createdAt", updated_at AS "updatedAt"
`;

async function listEntriesForUser(userId, entryType = null) {
  if (entryType) {
    const res = await query(
      `SELECT ${publicColumns}
       FROM reminiscence_memory_entries
       WHERE user_id = $1 AND entry_type = $2
       ORDER BY created_at DESC`,
      [userId, String(entryType)]
    );
    return res.rows.map(mapEntry);
  }
  const res = await query(
    `SELECT ${publicColumns}
     FROM reminiscence_memory_entries
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows.map(mapEntry);
}

async function createEntry({ userId, entryType, title, category = null, story = null, memoryDate = null, photoReference = null, consentStatus = false }) {
  const res = await query(
    `INSERT INTO reminiscence_memory_entries (
       user_id, entry_type, title, category, story, memory_date, photo_reference, consent_status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${publicColumns}`,
    [userId, String(entryType), title, category, story, memoryDate, photoReference, consentStatus]
  );
  return mapEntry(res.rows[0]);
}

async function deleteEntry(entryId, userId) {
  const res = await query(
    `DELETE FROM reminiscence_memory_entries
     WHERE id = $1 AND user_id = $2
     RETURNING ${publicColumns}`,
    [entryId, userId]
  );
  return mapEntry(res.rows[0]);
}

module.exports = {
  listEntriesForUser,
  createEntry,
  deleteEntry,
};
