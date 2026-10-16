const crypto = require('crypto');
const service = require('../../../src/services/reminiscencePhotoStorageService');

const originalFetch = global.fetch;
const oldEnv = {};

beforeAll(() => {
  ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_REMINISCENCE_BUCKET'].forEach((key) => { oldEnv[key] = process.env[key]; });
});

afterAll(() => {
  global.fetch = originalFetch;
  Object.entries(oldEnv).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
});

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIiwidGVzdCI6dHJ1ZX0.NOT_A_REAL_CREDENTIAL_TEST_ONLY';
  process.env.SUPABASE_REMINISCENCE_BUCKET = 'eldermeds-reminiscence-private';
});

describe('private reminiscence photo storage', () => {
  test.each([
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'],
    [Buffer.from('RIFF0000WEBP'), 'image/webp'],
  ])('recognizes actual image signature as %s', (buffer, type) => {
    expect(service.inspectImage(buffer).contentType).toBe(type);
  });

  test('rejects extension spoofing and oversized images based on bytes', () => {
    expect(() => service.inspectImage(Buffer.from('not an image'))).toThrow('Choose a valid');
    expect(() => service.inspectImage(Buffer.alloc(service.MAX_PHOTO_BYTES + 1, 1))).toThrow('smaller than 8 MB');
  });

  test('object key generation requires a UUID and owner path validation', () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(service.makeObjectKey(9, id, 'jpg')).toBe(`9/${id}.jpg`);
    expect(() => service.assertOwnedObjectKey(9, '10/private.jpg')).toThrow();
    expect(() => service.assertOwnedObjectKey(9, '9/../other.jpg')).toThrow();
    expect(() => service.assertOwnedObjectKey(9, '9/other-user/path.jpg')).toThrow();
    expect(() => service.makeObjectKey(9, 'arbitrary', 'jpg')).toThrow();
    expect(() => service.makeObjectKey(9, id, 'gif')).toThrow();
    expect(() => service.makeObjectKey(2147483648, id, 'jpg')).toThrow();
  });

  test('accepts only the dedicated private bucket configuration', () => {
    process.env.SUPABASE_REMINISCENCE_BUCKET = 'another-project-bucket';
    expect(() => service.getConfig()).toThrow('not configured');
    process.env.SUPABASE_REMINISCENCE_BUCKET = 'eldermeds-reminiscence-private';
    expect(service.getConfig().bucket).toBe('eldermeds-reminiscence-private');
  });

  test('uploads to owner-scoped private object key without exposing the secret', async () => {
    const id = crypto.randomUUID();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const result = await service.uploadPhoto({ userId: 9, requestId: id, buffer: Buffer.from([0xff, 0xd8, 0xff]) });
    expect(result.objectKey).toBe(`9/${id}.jpg`);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain(`/storage/v1/object/eldermeds-reminiscence-private/9/${id}.jpg`);
    expect(options.headers.Authorization).toBe(`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    expect(options.headers.apikey).toBe(process.env.SUPABASE_SERVICE_ROLE_KEY);
    expect(options.headers['x-upsert']).toBe('false');
  });

  test('sends a new Supabase secret API key in apikey only', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test-only-placeholder';
    const id = crypto.randomUUID();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await service.uploadPhoto({ userId: 9, requestId: id, buffer: Buffer.from([0xff, 0xd8, 0xff]) });

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.apikey).toBe('sb_secret_test-only-placeholder');
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  test('creates private signed URL and strips storage API key from client-facing link', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ signedURL: `/object/sign/eldermeds-reminiscence-private/9/${id}.jpg?token=short` }) });
    const url = await service.createSignedPhotoUrl(9, `9/${id}.jpg`);
    expect(url).toBe(`https://example.supabase.co/storage/v1/object/sign/eldermeds-reminiscence-private/9/${id}.jpg?token=short`);
    expect(url).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY);
  });
});
