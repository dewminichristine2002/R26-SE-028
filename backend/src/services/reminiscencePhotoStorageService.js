const crypto = require('crypto');

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 10 * 60;
const PRIVATE_BUCKET = 'eldermeds-reminiscence-private';

class PhotoStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PhotoStorageError';
    this.code = code;
  }
}

function getConfig() {
  const baseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = String(process.env.SUPABASE_REMINISCENCE_BUCKET || '').trim();
  if (!baseUrl || !serviceKey || bucket !== PRIVATE_BUCKET) {
    throw new PhotoStorageError('PHOTO_STORAGE_NOT_CONFIGURED', 'Private reminiscence photo storage is not configured.');
  }
  let parsed;
  try { parsed = new URL(baseUrl); } catch (_) {
    throw new PhotoStorageError('PHOTO_STORAGE_NOT_CONFIGURED', 'Private reminiscence photo storage is not configured.');
  }
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) || parsed.username || parsed.password) {
    throw new PhotoStorageError('PHOTO_STORAGE_NOT_CONFIGURED', 'Private reminiscence photo storage is not configured.');
  }
  return { baseUrl, serviceKey, bucket };
}

function inspectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new PhotoStorageError('PHOTO_INVALID', 'Choose a valid JPEG, PNG, or WebP image.');
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new PhotoStorageError('PHOTO_TOO_LARGE', 'Choose an image smaller than 8 MB.');
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp' };
  }
  throw new PhotoStorageError('PHOTO_INVALID', 'Choose a valid JPEG, PNG, or WebP image.');
}

function assertOwnedObjectKey(userId, objectKey) {
  const numericUserId = Number(userId);
  const validUserId = Number.isInteger(numericUserId) && numericUserId > 0 && numericUserId <= 2147483647;
  const validObjectKey = typeof objectKey === 'string'
    && new RegExp(`^${numericUserId}/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.(?:jpg|png|webp)$`, 'i').test(objectKey);
  if (!validUserId || !validObjectKey) {
    throw new PhotoStorageError('PHOTO_NOT_FOUND', 'The photo was not found.');
  }
}

function encodeObjectPath(objectKey) {
  return objectKey.split('/').map(encodeURIComponent).join('/');
}

function storageUrl(config, operation, objectKey = '') {
  const bucketPath = encodeURIComponent(config.bucket);
  const path = operation === 'sign'
    ? `/storage/v1/object/sign/${bucketPath}`
    : `/storage/v1/object/${bucketPath}`;
  return `${config.baseUrl}${path}${objectKey ? `/${encodeObjectPath(objectKey)}` : ''}`;
}

function headers(config, contentType) {
  const apiKeyHeaders = { apikey: config.serviceKey };
  // Supabase's new sb_secret keys are opaque API keys, not JWTs. Sending one
  // as Bearer causes JWT parsing to fail; legacy service_role JWTs still need
  // the Authorization header for Storage's service-role access.
  if (!config.serviceKey.startsWith('sb_secret_')) {
    apiKeyHeaders.Authorization = `Bearer ${config.serviceKey}`;
  }
  return {
    ...apiKeyHeaders,
    ...(contentType ? { 'Content-Type': contentType } : {}),
  };
}

async function readResponse(response, fallbackCode = 'PHOTO_STORAGE_FAILED') {
  if (response.ok) return response;
  if (response.status === 404) throw new PhotoStorageError('PHOTO_NOT_FOUND', 'The photo was not found.');
  if (response.status === 409) throw new PhotoStorageError('PHOTO_ALREADY_EXISTS', 'This photo upload is already in progress.');
  throw new PhotoStorageError(fallbackCode, 'Private photo storage could not complete the request.');
}

function makeObjectKey(userId, requestId, extension) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0 || Number(userId) > 2147483647) {
    throw new PhotoStorageError('PHOTO_INVALID', 'A valid photo owner is required.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId || ''))) {
    throw new PhotoStorageError('PHOTO_INVALID', 'A valid photo save request is required.');
  }
  if (!['jpg', 'png', 'webp'].includes(String(extension || '').toLowerCase())) {
    throw new PhotoStorageError('PHOTO_INVALID', 'A supported photo format is required.');
  }
  return `${Number(userId)}/${requestId}.${extension}`;
}

async function uploadAtKey(userId, objectKey, buffer, contentType) {
  assertOwnedObjectKey(userId, objectKey);
  const actualImage = inspectImage(buffer);
  const config = getConfig();
  const response = await fetch(storageUrl(config, 'upload', objectKey), {
    method: 'POST',
    headers: { ...headers(config, actualImage.contentType || contentType), 'x-upsert': 'false' },
    body: buffer,
  });
  await readResponse(response);
  return objectKey;
}

async function uploadPhoto({ userId, requestId, buffer }) {
  const image = inspectImage(buffer);
  const objectKey = makeObjectKey(userId, requestId, image.extension);
  assertOwnedObjectKey(userId, objectKey);
  const config = getConfig();
  const response = await fetch(storageUrl(config, 'upload', objectKey), {
    method: 'POST',
    headers: { ...headers(config, image.contentType), 'x-upsert': 'false' },
    body: buffer,
  });
  if (response.status === 409) return { objectKey, contentType: image.contentType, alreadyUploaded: true };
  await readResponse(response);
  return { objectKey, contentType: image.contentType, alreadyUploaded: false };
}

async function createSignedPhotoUrl(userId, objectKey) {
  assertOwnedObjectKey(userId, objectKey);
  const config = getConfig();
  const response = await fetch(storageUrl(config, 'sign', objectKey), {
    method: 'POST',
    headers: headers(config, 'application/json'),
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
  });
  await readResponse(response, 'PHOTO_URL_FAILED');
  const body = await response.json();
  const signedUrl = body.signedURL || body.signedUrl;
  if (!signedUrl) throw new PhotoStorageError('PHOTO_URL_FAILED', 'The private photo link could not be created.');
  if (/^https?:\/\//i.test(signedUrl)) return signedUrl;
  const normalizedPath = signedUrl.startsWith('/storage/v1/')
    ? signedUrl
    : `/storage/v1${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
  return new URL(normalizedPath, config.baseUrl).toString();
}

async function downloadPhoto(userId, objectKey) {
  assertOwnedObjectKey(userId, objectKey);
  const config = getConfig();
  const response = await fetch(storageUrl(config, 'authenticated', objectKey), {
    method: 'GET',
    headers: headers(config),
  });
  await readResponse(response);
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') || 'application/octet-stream' };
}

async function deletePhoto(userId, objectKey) {
  assertOwnedObjectKey(userId, objectKey);
  const config = getConfig();
  const response = await fetch(`${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}`, {
    method: 'DELETE',
    headers: headers(config, 'application/json'),
    body: JSON.stringify({ prefixes: [objectKey] }),
  });
  if (response.status === 404) return;
  await readResponse(response);
}

function createPhotoRequestId() {
  return crypto.randomUUID();
}

module.exports = {
  MAX_PHOTO_BYTES,
  PhotoStorageError,
  assertOwnedObjectKey,
  createPhotoRequestId,
  createSignedPhotoUrl,
  deletePhoto,
  downloadPhoto,
  getConfig,
  inspectImage,
  makeObjectKey,
  uploadAtKey,
  uploadPhoto,
};
