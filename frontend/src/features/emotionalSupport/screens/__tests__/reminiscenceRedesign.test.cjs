const fs = require('fs');
const path = require('path');
const featureRoot = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(featureRoot, name), 'utf8');

describe('reminiscence album redesign contracts', () => {
  const hub = read('screens/ReminiscenceHubScreen.js');
  const photo = read('screens/PhotoMemoryScreen.js');
  const revisit = read('screens/RevisitMemoriesScreen.js');
  const conversation = read('screens/MemoryConversationScreen.js');
  const activity = read('screens/ReminiscenceActivityScreen.js');

  test('Memory Corner presents only Revisit, the unified Life Book, and Guided Memories', () => {
    ['RevisitMemoriesScreen', 'MyLifeBook', 'MemoryMomentScreen'].forEach((route) => expect(hub).toContain(`route: '${route}'`));
    expect(hub).not.toContain('My Photo Memories');
    expect(hub).not.toContain('Good Deeds & Proud Moments');
    expect(hub).toContain('Guided Memories');
    expect(hub).toContain('MEMORY CORNER');
    expect(hub).toContain('Enjoy meaningful moments at your own pace.');
    expect(hub).not.toContain('YOUR PERSONAL ALBUM');
    expect(hub).not.toContain('Memories, at your pace');
    expect(hub).not.toContain('Start with a gentle memory prompt');
  });

  test('Memory Corner uses three clear full-width actions with accessible accent colors', () => {
    [
      ['Revisit My Memories', 'Reconnect with saved photos and stories.', 'Begin Memory Session', '#98566C', 'RevisitMemoriesScreen'],
      ['My Life Book', 'Organize your personal photos and stories.', 'Open Life Book', '#936638', 'MyLifeBook'],
      ['Guided Memories', 'Explore gentle memory prompts.', 'Start Guided Memories', '#70538B', 'MemoryMomentScreen'],
    ].forEach(([title, description, action, color, route]) => {
      expect(hub).toContain(`label: '${title}'`);
      expect(hub).toContain(`description: '${description}'`);
      expect(hub).toContain(`action: '${action}'`);
      expect(hub).toContain(`color: '${color}'`);
      expect(hub).toContain(`route: '${route}'`);
    });
    expect(hub).toContain("width: '100%'");
    expect(hub).toContain('accessibilityRole="button"');
  });

  test('photo screen keeps private upload, text-only save, retry, and upload feedback', () => {
    expect(photo).toContain('Save Photo Privately');
    expect(photo).toContain('Save Text Only');
    expect(photo).toContain('Retry photo save');
    expect(photo).toContain('loading={saving}');
    expect(photo).toContain('createMemoryEntryWithPhoto(payload, photoAsset, photoRequestId.current)');
  });

  test('album cards show private photos when available without displaying saved narratives', () => {
    expect(revisit).toContain('<PrivateMemoryPhoto entryId={entry.id} userId={elderId} photoUrl={entry.photoUrl}');
    expect(revisit).toContain('A written story is saved with this moment.');
    expect(revisit).not.toContain('{entry.story}');
    expect(revisit).toContain("navigation.navigate('MemoryConversationScreen', { entryId: entry.id })");
  });

  test('guided conversation keeps the reminder disclosure gate and gentle exits', () => {
    expect(conversation).toContain('Remind me');
    expect(conversation).toContain("!revealed ? <>");
    expect(conversation).toContain('entry.story ||');
    expect(conversation).toContain('Skip this prompt');
    expect(conversation).toContain('Change topic');
    expect(conversation).toContain('Finish for now');
    expect(conversation).toContain("navigate('ReminiscenceHubScreen')");
  });

  test('completion offers another memory, Memory Corner, and Home without scores', () => {
    expect(activity).toContain('Revisit Another Memory');
    expect(activity).toContain('Return to Memory Corner');
    expect(activity).toContain('Return Home');
    expect(activity).toContain('There is no score or assessment');
  });
});
