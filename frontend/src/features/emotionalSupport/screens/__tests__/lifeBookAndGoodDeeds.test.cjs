const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('unified My Life Book and legacy Good Deeds experience', () => {
  const life = read('screens/MyLifeBookScreen.js');
  const good = read('screens/GoodDeedsScreen.js');

  test('unified Life Book supports private photos, text-only stories, optional categories, and dates', () => {
    expect(life).toContain('Choose a Photo');
    expect(life).toContain('Remove photo');
    expect(life).toContain('Memory date (optional)');
    expect(life).toContain('Category (optional)');
    expect(life).toContain('No category');
    expect(life).toContain('Other / My Own Category');
    expect(life).toContain('Saved memories');
    expect(life).toContain('Save Text Only');
    expect(life).toContain('createMemoryEntryWithPhoto');
    expect(life).toContain('Save Photo Privately');
    expect(life).toContain('Retry photo save');
    expect(life).toContain('listMemoryEntries(elderId)');
    expect(life).toContain("['life_book', 'good_deed']");
    expect(life).toContain("navigation.navigate('MemoryConversationScreen', { entryId: entry.id })");
    expect(life).toContain('deleteMemoryEntry(entryId, elderId)');
  });

  test('legacy Good Deeds screen remains available and its route uses the unified book', () => {
    expect(good).toContain('Choose a Photo');
    const navigator = read('EmotionalSupportNavigator.jsx');
    expect(navigator).toContain('GoodDeeds: MyLifeBook');
    expect(navigator).toContain('PhotoMemoryScreen: MyLifeBook');
    expect(life).toContain("entry_type: legacyGoodDeedsRoute ? 'good_deed' : 'life_book'");
  });

  test('category persistence uses the existing category column and retains entry type semantics', () => {
    const repositoryRoot = path.resolve(featureRoot, '..', '..', '..', '..');
    const migration = fs.readFileSync(path.join(repositoryRoot, 'backend', 'migrations', '1750000000000_component4_reminiscence_memory_entries.js'), 'utf8');
    const controller = fs.readFileSync(path.join(repositoryRoot, 'backend', 'src', 'controllers', 'reminiscenceMemoryController.js'), 'utf8');
    expect(migration).toMatch(/category\s+VARCHAR\(80\)/i);
    expect(controller).toContain(".slice(0, 80) || null");
    expect(life).toContain('category: category.trim() || null');
    expect(life).toContain("entry_type: legacyGoodDeedsRoute ? 'good_deed' : 'life_book'");
  });
});
