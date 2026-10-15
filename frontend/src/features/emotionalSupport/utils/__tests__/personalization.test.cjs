const Module = require('module');
const path = require('path');
const { transformFileSync } = require('@babel/core');

function loadSourceModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const compiled = transformFileSync(filename, { presets: ['babel-preset-expo'] }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

const { getPersonalizedGreeting, getSafeFirstName, getTimeGreeting } = loadSourceModule('../personalization.js');
const atHour = (hour, minute = 0) => new Date(2026, 7, 24, hour, minute);

describe('Emotional Support personalization', () => {
  test.each([[6, 0], [11, 59]])('%d:%d uses morning', (hour, minute) => expect(getTimeGreeting(atHour(hour, minute))).toBe('Good morning'));
  test.each([[12, 0], [16, 59]])('%d:%d uses afternoon', (hour, minute) => expect(getTimeGreeting(atHour(hour, minute))).toBe('Good afternoon'));
  test.each([[17, 0], [23, 0], [3, 0]])('%d:%d uses evening', (hour, minute) => expect(getTimeGreeting(atHour(hour, minute))).toBe('Good evening'));
  test('prefers first name and safely extracts a profile name', () => {
    expect(getSafeFirstName({ firstName: 'Shanthi', fullName: 'Different Name' })).toBe('Shanthi');
    expect(getSafeFirstName({ fullName: 'Shanthi Perera' })).toBe('Shanthi');
    expect(getPersonalizedGreeting({ fullName: 'Shanthi Perera' }, atHour(6))).toBe('Good morning, Shanthi');
  });
  test('omits missing or email-like names', () => {
    expect(getPersonalizedGreeting(null, atHour(6))).toBe('Good morning');
    expect(getPersonalizedGreeting({ displayName: 'shanthi@example.com' }, atHour(6))).toBe('Good morning');
  });
});
