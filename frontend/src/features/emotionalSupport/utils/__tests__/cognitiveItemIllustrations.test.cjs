const path = require('path');
const { BANK } = require(path.resolve(__dirname, '../../../../../../backend/src/data/cognitiveActivityBank.js'));
const { resolveItemIllustration } = require('../cognitiveItemIllustrations');

describe('cognitive object illustration manifest', () => {
  test('maps the reported mismatched objects to their own distinct deterministic illustrations', () => {
    const orange = resolveItemIllustration('Orange');
    const apple = resolveItemIllustration('Apple');
    const plate = resolveItemIllustration('Plate');
    const spoon = resolveItemIllustration('Spoon');

    expect(orange.kind).toBe('illustration');
    expect(orange.glyph).toBe(String.fromCodePoint(0x1f34a));
    expect(orange.glyph).not.toBe(apple.glyph);
    expect(plate.kind).toBe('illustration');
    expect(plate.glyph).not.toBe(spoon.glyph);
    expect(resolveItemIllustration('Garden').kind).toBe('illustration');
    expect(resolveItemIllustration('Mirror').kind).toBe('illustration');
    expect(resolveItemIllustration('Bicycle').kind).toBe('illustration');
    expect(resolveItemIllustration('Guitar').kind).toBe('illustration');
    expect(resolveItemIllustration('Piano').kind).toBe('illustration');
  });

  test('unknown labels get an explicit readable text fallback, not a decorative glyph', () => {
    expect(resolveItemIllustration('Pillow')).toEqual({ kind: 'text', text: 'Pillow', label: 'Pillow' });
    expect(resolveItemIllustration('Unknown object')).toEqual({ kind: 'text', text: 'Unknown object', label: 'Unknown object' });
    expect(resolveItemIllustration('').kind).toBe('text');
  });

  test('every game family catalog item has a deterministic, labeled illustration or text fallback', () => {
    const itemLabels = new Set();
    Object.values(BANK).forEach((difficultyGroups) => Object.values(difficultyGroups).forEach((items) => items.forEach((item) => {
      (item.studyItems || []).forEach((label) => itemLabels.add(label));
      (item.options || []).forEach((option) => itemLabels.add(typeof option === 'string' ? option : option.label));
    })));

    expect(itemLabels.size).toBeGreaterThan(50);
    for (const label of itemLabels) {
      const resolved = resolveItemIllustration(label);
      expect(['illustration', 'text']).toContain(resolved.kind);
      expect(resolved.label).toBe(label);
      if (resolved.kind === 'text') expect(resolved.text).toBe(label);
    }
  });

  test('memorize and recall reuse identical artwork for the same item labels', () => {
    const memoryItems = BANK.short_memory_recall.medium[0];
    memoryItems.studyItems.forEach((label) => {
      const recallOption = memoryItems.options.find((option) => option.label === label);
      expect(recallOption).toBeDefined();
      expect(resolveItemIllustration(label)).toEqual(resolveItemIllustration(recallOption.label));
      expect(recallOption.id).toBe(label.toLowerCase());
    });
  });
});
