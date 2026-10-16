const fs = require('fs');
const path = require('path');
const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');
const stripComments = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const backendRoot = path.resolve(featureRoot, '..', '..', '..', '..', 'backend', 'src');

describe('photo-assisted reminiscence safety contract', () => {
  const source = read('screens/PhotoMemoryScreen.js');
  test('the elder explicitly chooses one photo via the system picker', () => {
    expect(source).toContain('launchImageLibraryAsync');
    expect(source).toContain('Choose a Photo');
    expect(source).toContain('allowsMultipleSelection: false');
  });
  test('no facial recognition, identity inference, or image analysis exists', () => {
    const forbidden = [/face recognition/i, /facial recognition/i, /identify people/i, /recognize faces/i, /label relatives?/i, /infer age/i, /MLKit/i, /face detection/i, /analyzeImage/i];
    forbidden.forEach((pattern) => expect(stripComments(source)).not.toMatch(pattern));
    expect(source).toContain('visual memory cue only');
  });
  test('photo upload requires explicit save choice and supports text-only fallback', () => {
    expect(source).toContain('createMemoryEntryWithPhoto');
    expect(source).toContain('Save photo and story');
    expect(source).toContain('Save story only');
    expect(source).toContain('Retry photo save');
    expect(source).toContain('createMemoryPhotoRequestId');
    expect(source).toMatch(/setPhotoUri\(null\)/);
  });
  test('photo can be removed by the elder', () => {
    expect(source).toContain('Remove photo');
    expect(source).toContain('function removePhoto()');
  });
  test('memory sharing supports voice and typing', () => {
    expect(source).toContain('Would you like to tell me something you remember about this photo?');
    expect(source).toContain('VoiceAnswerControl');
    expect(source).toContain('TextInput');
  });
  test('consent behavior remains topic-only for remembered topics', () => {
    expect(source).toContain('Would you like ElderMeds to remember this topic for future memory activities?');
    expect(source).toContain('not the photo, not your full words');
    expect(source).toContain("source_activity_id: 'photo_reminiscence'");
  });
});

describe('private photo persistence API contract', () => {
  const api = read('api/emotionalSupportApi.js');
  const storage = fs.readFileSync(path.join(backendRoot, 'services', 'reminiscencePhotoStorageService.js'), 'utf8');
  const photoComponent = read('components/PrivateMemoryPhoto.js');
  test('mobile sends multipart photo with stable retry ID through authenticated API', () => {
    expect(api).toContain("form.append('photo'");
    expect(api).toContain('photo_request_id: requestId');
    expect(api).toContain("'/reminiscence-entries/with-photo'");
  });
  test('backend validates bytes, owner path, and short lived private signed URLs', () => {
    expect(storage).toContain('MAX_PHOTO_BYTES = 8 * 1024 * 1024');
    expect(storage).toContain('function inspectImage');
    expect(storage).toContain('function assertOwnedObjectKey');
    expect(storage).toContain('SIGNED_URL_TTL_SECONDS = 10 * 60');
  });
  test('expired links are refreshed and unavailable images degrade to a placeholder', () => {
    expect(photoComponent).toContain('refreshMemoryPhotoUrl(entryId, userId)');
    expect(photoComponent).toContain('onError={refresh}');
    expect(photoComponent).toContain('Photo temporarily unavailable');
  });
});

describe('backend consent gate for reminiscence topics', () => {
  const controller = fs.readFileSync(path.join(backendRoot, 'controllers', 'reminiscenceMemoryController.js'), 'utf8');
  const repository = fs.readFileSync(path.join(backendRoot, 'repositories', 'reminiscenceMemoryRepository.js'), 'utf8');
  const migration = fs.readFileSync(path.join(backendRoot, '..', 'migrations', '1748640000000_component4_reminiscence_user_topics.js'), 'utf8');
  test('saving without explicit consent is rejected server-side', () => {
    expect(controller).toContain('if (!consent)');
    expect(controller).toContain('403');
    expect(controller).toContain('Explicit consent is required');
  });
  test('rows are only ever written with recorded consent timestamp', () => {
    expect(repository).toContain('consent_status, consent_recorded_at');
    expect(migration).toMatch(/CHECK \(\s*consent_status = FALSE OR consent_recorded_at IS NOT NULL\s*\)/s);
  });
  test('deletion is soft and scoped to the owner', () => {
    expect(repository).toContain('is_active = FALSE');
    expect(repository).toContain('WHERE id = $1 AND user_id = $2');
  });
  test('prompt selection prefers least-recently-used topics', () => {
    expect(repository).toContain('last_used_at NULLS FIRST');
    expect(controller).toContain('markTopicUsed(topic.id)');
  });
});
