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
    // No gallery scanning or bulk upload anywhere.
        expect(stripComments(source)).not.toMatch(/scan|upload/i);
  });

  test('no facial recognition, identity inference, or image analysis exists', () => {
    const forbidden = [/face recognition/i, /facial recognition/i, /identify people/i, /recognize faces/i, /label relatives?/i, /infer age/i, /MLKit/i, /face detection/i, /analyzeImage/i];
        forbidden.forEach((pattern) => expect(stripComments(source)).not.toMatch(pattern));
    // The photo is only ever displayed as a cue.
    expect(source).toContain('visual memory cue only');
  });

  test('photo is not retained unexpectedly — cleared on unmount, never sent to backend', () => {
    expect(source).toContain('clear the local photo reference when leaving the screen');
    expect(source).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]*?setPhotoUri\(null\)/);
    // The photo URI never appears in any API payload.
    expect(source).not.toMatch(/\{[^}]*photoUri[^}]*\}.*saveReminiscenceTopic/s);
    expect(source).toContain('The photo itself was never saved');
  });

  test('photo can be removed/cancelled by the elder', () => {
    expect(source).toContain('Remove photo');
    expect(source).toContain('function removePhoto()');
  });

  test('memory sharing supports both voice and typing with the standard prompt', () => {
    expect(source).toContain('Would you like to tell me something you remember about this photo?');
    expect(source).toContain('VoiceAnswerControl');
    expect(source).toContain('TextInput');
  });

  test('consent behavior documented and topic-only storage enforced', () => {
    expect(source).toContain('Would you like ElderMeds to remember this topic for future memory activities?');
    expect(source).toContain('not the photo, not your full words');
    expect(source).toContain("source_activity_id: 'photo_reminiscence'");
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

  test('rows are only ever written with a recorded consent timestamp', () => {
    expect(repository).toContain('consent_status, consent_recorded_at');
    expect(migration).toMatch(/CHECK \(\s*consent_status = FALSE OR consent_recorded_at IS NOT NULL\s*\)/s);
  });

  test('deletion is soft (reversible) and scoped to the owning user', () => {
    expect(repository).toContain('is_active = FALSE');
    expect(repository).toContain('WHERE id = $1 AND user_id = $2');
  });

  test('prompt selection prefers least-recently-used topics and marks usage', () => {
    expect(repository).toContain('last_used_at NULLS FIRST');
    expect(controller).toContain('markTopicUsed(topic.id)');
  });
});