const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('My Life Book and My Good Deeds screens', () => {
  const life = read('screens/MyLifeBookScreen.js');
  const good = read('screens/GoodDeedsScreen.js');

  test('life book supports optional photo selection, category and date selection, and remove', () => {
    expect(life).toContain('Choose a Photo');
    expect(life).toContain('Remove photo');
    expect(life).toContain('Choose a date');
    expect(life).toContain('Category (optional)');
    expect(life).toContain('Existing entries');
    expect(life).toContain('Save Entry');
  });

  test('good deeds supports optional photo selection, category and date, and remove', () => {
    expect(good).toContain('Choose a Photo');
    expect(good).toContain('Remove photo');
    expect(good).toContain('Choose a date');
    expect(good).toContain('Choose a category');
    expect(good).toContain('Save Entry');
    expect(good).toContain('Existing entries');
  });
});
