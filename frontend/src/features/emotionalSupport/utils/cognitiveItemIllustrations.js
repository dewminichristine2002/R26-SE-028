// Exact, deterministic icons for cognitive-bank labels. Unmapped labels use a
// text tile, never a guessed or decorative substitute.
const icon = (...codePoints) => String.fromCodePoint(...codePoints);
const illustrationByLabel = Object.freeze({
  apple: icon(0x1f34e), orange: icon(0x1f34a), banana: icon(0x1f34c), carrot: icon(0x1f955),
  flower: icon(0x1f33c), rose: icon(0x1f339), garden: icon(0x1fab4), plant: icon(0x1f331),
  tree: icon(0x1f333), oak: icon(0x1f333), maple: icon(0x1f333), pine: icon(0x1f332),
  chair: icon(0x1fa91), car: icon(0x1f697), bus: icon(0x1f68c), boat: icon(0x1f6a4), bicycle: icon(0x1f6b2),
  cup: icon(0x2615), plate: icon(0x1f37d, 0xfe0f), spoon: icon(0x1f944), fork: icon(0x1f374), bread: icon(0x1f35e),
  book: icon(0x1f4d6), newspaper: icon(0x1f4f0), letter: icon(0x2709, 0xfe0f), pencil: icon(0x270f, 0xfe0f),
  pen: icon(0x1f58a, 0xfe0f), marker: icon(0x1f58d, 0xfe0f), key: icon(0x1f511), hat: icon(0x1f452), shoe: icon(0x1f45e),
  ball: icon(0x26bd), clock: icon(0x1f552), calendar: icon(0x1f5d3, 0xfe0f), april: icon(0x1f4c5), mirror: icon(0x1fa9e),
  guitar: icon(0x1f3b8), piano: icon(0x1f3b9), violin: icon(0x1f3bb), radio: icon(0x1f4fb),
  kettle: icon(0x1fad6), teapot: icon(0x1fad6), scarf: icon(0x1f9e3), glasses: icon(0x1f453), spectacles: icon(0x1f453),
  window: icon(0x1fa9f), lamp: icon(0x1f4a1), dog: icon(0x1f415), cat: icon(0x1f408), bird: icon(0x1f426),
  sock: icon(0x1f9e6), basket: icon(0x1f9fa), bottle: icon(0x1f9f4), blanket: icon(0x1f6cc),
  circle: icon(0x25cf), square: icon(0x25a0), triangle: icon(0x25b2), star: icon(0x2605), diamond: icon(0x25c6),
  red: icon(0x1f7e5), blue: icon(0x1f7e6), green: icon(0x1f7e9), yellow: icon(0x1f7e8),
  spring: icon(0x1f338), summer: icon(0x2600, 0xfe0f), winter: icon(0x2744, 0xfe0f),
  walk: icon(0x1f6b6), run: icon(0x1f3c3), sleep: icon(0x1f634),
  'put tea in the cup': icon(0x1f375), 'turn on the water': icon(0x1f6b0), 'wash with soap': icon(0x1f9fc),
  'wake up': icon(0x1f305), 'get dressed': icon(0x1f455), 'eat breakfast': icon(0x1f950),
  'write the letter': icon(0x270d, 0xfe0f), 'put it in an envelope': icon(0x2709, 0xfe0f), 'post the envelope': icon(0x1f4ee),
  'water the soil': icon(0x1f331),
  'choose a simple recipe': icon(0x1f4d6), 'prepare the meal': icon(0x1f373), 'serve the meal': icon(0x1f37d, 0xfe0f),
  'choose the items': icon(0x1f9fa), 'collect the clothes': icon(0x1f9fa), 'wash the clothes': icon(0x1f9fc),
  'dry the clothes': icon(0x2600, 0xfe0f), 'fold the clothes': icon(0x1f455), 'gather ingredients': icon(0x1f9fa),
  'write a list': icon(0x1f4dd), 'go to the shop': icon(0x1f6d2), 'pay for the items': icon(0x1f4b3),
  'check the appointment time': icon(0x1f4c5), 'travel to the clinic': icon(0x1f68c), 'check in at reception': icon(0x1f3e5),
  'meet the clinician': icon(0x1f9d1, 0x200d, 0x2695, 0xfe0f), 'place the plates': icon(0x1f37d, 0xfe0f),
  'place the cutlery': icon(0x1f374), 'add the cups': icon(0x2615), 'invite everyone to sit': icon(0x1fa91),
});

const normalizeLabel = (label) => String(label ?? '').trim().toLowerCase();

function resolveItemIllustration(label) {
  const displayLabel = String(label ?? '').trim() || 'Item';
  const glyph = illustrationByLabel[normalizeLabel(label)];
  return glyph
    ? { kind: 'illustration', glyph, label: displayLabel }
    : { kind: 'text', text: displayLabel, label: displayLabel };
}

module.exports = { illustrationByLabel, normalizeLabel, resolveItemIllustration };
