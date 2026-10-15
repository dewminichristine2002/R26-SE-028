jest.mock('../../../src/repositories/reminiscenceMemoryEntryRepository');
const entryRepo = require('../../../src/repositories/reminiscenceMemoryEntryRepository');

beforeEach(() => {
  jest.resetAllMocks();
});

describe('reminiscence entries controller (create/list/delete)', () => {
  test('createEntry returns 400 for invalid user', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { body: { user_id: -1, entry_type: 'life_book', title: 'X' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('createEntry returns 400 for missing title', async () => {
    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { body: { user_id: 1, entry_type: 'life_book', title: '' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  test('createEntry returns 201 and created entry on success', async () => {
    const fakeEntry = { id: 'abc', userId: 1, entryType: 'life_book', title: 'A', story: 's' };
    entryRepo.createEntry.mockResolvedValue(fakeEntry);

    const { createEntry } = require('../../../src/controllers/reminiscenceMemoryController');
    const req = { body: { user_id: 1, entry_type: 'life_book', title: 'A', story: 's' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await createEntry(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, entry: fakeEntry });
  });
});
