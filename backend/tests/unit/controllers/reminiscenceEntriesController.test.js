jest.mock('../../../src/repositories/reminiscenceMemoryEntryRepository');
jest.mock('../../../src/services/reminiscencePhotoStorageService', () => ({
  uploadPhoto: jest.fn(),
  createSignedPhotoUrl: jest.fn(),
  downloadPhoto: jest.fn(),
  deletePhoto: jest.fn(),
  uploadAtKey: jest.fn(),
}));
const entryRepo = require('../../../src/repositories/reminiscenceMemoryEntryRepository');
const photoStorage = require('../../../src/services/reminiscencePhotoStorageService');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('reminiscence entries controller (create/list/delete)', () => {
  test('createEntry returns 400 for invalid user', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, body: { user_id: -1, entry_type: 'life_book', title: 'X' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('createEntry returns 400 for missing title', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, body: { user_id: 1, entry_type: 'life_book', title: '' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('createEntry returns 201 and created entry on success', async () => {
    const fakeEntry = { id: 'abc', userId: 1, entryType: 'life_book', title: 'A', story: 's' };
    entryRepo.createEntry.mockResolvedValue(fakeEntry);

    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, body: { user_id: 1, entry_type: 'life_book', title: 'A', story: 's' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, entry: fakeEntry });
  });

  test('createEntry rejects a different requested owner before repository access', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, body: { user_id: 2, entry_type: 'life_book', title: 'Private story' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(entryRepo.createEntry).not.toHaveBeenCalled();
  });

  test('createEntry requires an authenticated owner', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { body: { user_id: 1, entry_type: 'life_book', title: 'Private story' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(entryRepo.createEntry).not.toHaveBeenCalled();
  });

  test('listEntries rejects another user id', async () => {
    const { listEntries } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, params: { userId: '2' }, query: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await listEntries(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(entryRepo.listEntriesForUser).not.toHaveBeenCalled();
  });

  test('deleteEntry rejects another user id before repository access', async () => {
    const { deleteEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { user: { id: 1 }, params: { entryId: 'memory-2' }, body: { user_id: 2 } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await deleteEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(entryRepo.deleteEntry).not.toHaveBeenCalled();
  });
});

describe('reminiscence photo persistence controller', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const key = '1/123e4567-e89b-42d3-a456-426614174000.jpg';
  const request = () => ({
    user: { id: 1 },
    body: { user_id: '1', entry_type: 'life_book', title: 'Saved photo', consent: 'true', photo_request_id: '123e4567-e89b-42d3-a456-426614174000' },
    file: { buffer: jpeg },
  });
  const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

  beforeEach(() => {
    entryRepo.createEntry.mockReset();
    entryRepo.findEntryByPhotoReference.mockReset();
    entryRepo.getEntryForUser.mockReset();
    entryRepo.deleteEntry.mockReset();
    photoStorage.uploadPhoto.mockReset();
    photoStorage.createSignedPhotoUrl.mockReset();
    photoStorage.downloadPhoto.mockReset();
    photoStorage.deletePhoto.mockReset();
    photoStorage.uploadAtKey.mockReset();
  });

  test('explicit photo consent uploads under owner key then persists that reference', async () => {
    photoStorage.uploadPhoto.mockResolvedValue({ objectKey: key });
    entryRepo.findEntryByPhotoReference.mockResolvedValue(null);
    entryRepo.createEntry.mockResolvedValue({ id: 'entry-1', userId: 1, photoReference: key });
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(request(), res);
    expect(photoStorage.uploadPhoto).toHaveBeenCalledWith({ userId: 1, requestId: '123e4567-e89b-42d3-a456-426614174000', buffer: jpeg });
    expect(entryRepo.createEntry).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, photoReference: key, consentStatus: true }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].entry).not.toHaveProperty('photoReference');
    expect(res.json.mock.calls[0][0].entry.photoSaved).toBe(true);
  });

  test('storage upload failure does not create a memory row', async () => {
    photoStorage.uploadPhoto.mockRejectedValue(Object.assign(new Error('storage unavailable'), { code: 'PHOTO_STORAGE_FAILED' }));
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(request(), res);
    expect(entryRepo.createEntry).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('photo upload requires affirmative consent and owner scope', async () => {
    const req = request(); req.body.consent = 'false';
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(photoStorage.uploadPhoto).not.toHaveBeenCalled();
  });

  test('photo upload cannot target a different account', async () => {
    const req = request(); req.body.user_id = '2';
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(photoStorage.uploadPhoto).not.toHaveBeenCalled();
  });

  test('photo URL refresh rejects cross-user access and entries without a photo', async () => {
    const controller = require('../../../src/controllers/reminiscenceMemoryController');
    const forbidden = response();
    await controller.getEntryPhotoUrl({ user: { id: 1 }, params: { entryId: 'entry-2' }, query: { user_id: '2' } }, forbidden);
    expect(forbidden.status).toHaveBeenCalledWith(403);
    expect(entryRepo.getEntryForUser).not.toHaveBeenCalled();

    entryRepo.getEntryForUser.mockResolvedValue({ id: 'entry-1', userId: 1, photoReference: null });
    const missing = response();
    await controller.getEntryPhotoUrl({ user: { id: 1 }, params: { entryId: 'entry-1' }, query: {} }, missing);
    expect(missing.status).toHaveBeenCalledWith(404);
    expect(photoStorage.createSignedPhotoUrl).not.toHaveBeenCalled();
  });

  test('retries reuse the uploaded photo key and do not duplicate the entry', async () => {
    photoStorage.uploadPhoto.mockResolvedValue({ objectKey: key, alreadyUploaded: true });
    entryRepo.findEntryByPhotoReference.mockResolvedValue({ id: 'entry-existing', userId: 1, photoReference: key });
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(request(), res);
    expect(entryRepo.createEntry).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('database save failure compensates by deleting the uploaded object', async () => {
    photoStorage.uploadPhoto.mockResolvedValue({ objectKey: key });
    entryRepo.findEntryByPhotoReference.mockResolvedValue(null);
    entryRepo.createEntry.mockRejectedValue(new Error('database unavailable'));
    photoStorage.deletePhoto.mockResolvedValue();
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').createEntryWithPhoto(request(), res);
    expect(photoStorage.deletePhoto).toHaveBeenCalledWith(1, key);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toContain('Retry the photo or save text only');
  });

  test('listing returns short-lived photo URLs and strips private object keys', async () => {
    entryRepo.listEntriesForUser.mockResolvedValue([{ id: 'entry-1', userId: 1, photoReference: key, title: 'Private' }]);
    photoStorage.createSignedPhotoUrl.mockResolvedValue('https://private.example/signed');
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').listEntries({ user: { id: 1 }, params: { userId: '1' }, query: {} }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.entries[0]).toEqual(expect.objectContaining({ photoUrl: 'https://private.example/signed' }));
    expect(payload.entries[0]).not.toHaveProperty('photoReference');
  });

  test('deleting a photo entry removes private object and restores it if DB delete fails', async () => {
    entryRepo.getEntryForUser.mockResolvedValue({ id: 'entry-1', userId: 1, photoReference: key });
    photoStorage.downloadPhoto.mockResolvedValue({ buffer: jpeg, contentType: 'image/jpeg' });
    photoStorage.deletePhoto.mockResolvedValue();
    entryRepo.deleteEntry.mockRejectedValue(new Error('db unavailable'));
    const res = response();
    await require('../../../src/controllers/reminiscenceMemoryController').deleteEntry({ user: { id: 1 }, params: { entryId: 'entry-1' }, body: { user_id: 1 } }, res);
    expect(photoStorage.uploadAtKey).toHaveBeenCalledWith(1, key, jpeg, 'image/jpeg');
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
