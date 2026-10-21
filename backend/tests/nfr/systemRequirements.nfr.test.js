const fs = require('fs');
const path = require('path');

const routeFiles = [
  'auth.js',
  'users.js',
  'medications.js',
  'routines.js',
  'intakeMonitoring.js',
  'allergies.js',
  'prescriptions.js',
  'emotionalSupportRoutes.js',
  'assistant.js',
  'predict.js',
  'healthAdvice.js',
];

describe('system non-functional requirements coverage', () => {
  test('maintainability: every backend route family has integration coverage declared', () => {
    const integrationTest = fs.readFileSync(
      path.resolve(__dirname, '../integration/systemRoutes.integration.test.js'),
      'utf8'
    );

    [
      'health',
      'auth',
      'users',
      'medications',
      'routines',
      'intake',
      'allergies',
      'prescriptions',
      'emotional support',
      'assistant',
      'predict',
      'health advice',
    ].forEach((area) => {
      expect(integrationTest.toLowerCase()).toContain(area);
    });
  });

  test('maintainability: the E2E journey covers every backend route family', () => {
    const e2eTest = fs.readFileSync(
      path.resolve(__dirname, '../e2e/systemJourney.e2e.test.js'),
      'utf8'
    );

    [
      '/api/health',
      '/api/auth',
      '/api/users',
      '/api/medications',
      '/api/routines',
      '/api/intake-monitoring',
      '/api/allergies',
      '/api/prescriptions',
      '/api/emotional-support',
      '/api/assistant',
      '/api/predict',
      '/api/health-advice',
    ].forEach((routeFamily) => {
      expect(e2eTest).toContain(routeFamily);
    });
  });

  test('security: route files that expose personal health data use an auth guard', () => {
    const routesDir = path.resolve(__dirname, '../../src/routes');
    const publicRoutes = new Set(['auth.js', 'prescriptions.js']);

    routeFiles
      .filter((file) => !publicRoutes.has(file))
      .forEach((file) => {
        const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
        expect(source).toContain('requireAuth');
      });
  });

  test('reliability: database-backed route families use database status gating where required', () => {
    const routesDir = path.resolve(__dirname, '../../src/routes');
    ['allergies.js', 'assistant.js', 'predict.js', 'healthAdvice.js'].forEach((file) => {
      const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
      expect(source).toContain('requireDatabase');
    });
  });

  test('usability: categorized test commands exist for simple terminal execution', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')
    );

    ['test:unit', 'test:integration', 'test:nfr', 'test:e2e', 'test:all', 'test:evidence'].forEach((script) => {
      expect(packageJson.scripts).toHaveProperty(script);
    });
  });
});
