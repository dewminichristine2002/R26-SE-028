const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const backendDir = path.join(repoRoot, 'backend');
const reportPath = path.join(repoRoot, 'docs', 'TESTING_EVIDENCE.md');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const commands = [
  ['Unit', ['run', 'test:unit']],
  ['Integration', ['run', 'test:integration']],
  ['NFR', ['run', 'test:nfr']],
  ['E2E', ['run', 'test:e2e']],
];

const results = commands.map(([label, args]) => {
  const startedAt = new Date();
  const result = spawnSync(npmCommand, args, {
    cwd: backendDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const spawnError = result.error ? `${result.error.name}: ${result.error.message}` : '';

  return {
    label,
    command: `${npmCommand} ${args.join(' ')}`,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status,
    startedAt,
    finishedAt: new Date(),
    output: [result.stdout || '', result.stderr || '', spawnError].filter(Boolean).join('\n').trim(),
  };
});

const report = [
  '# Testing Evidence',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  '| Category | Status | Command |',
  '| --- | --- | --- |',
  ...results.map((result) => `| ${result.label} | ${result.status} | \`${result.command}\` |`),
  '',
  ...results.flatMap((result) => [
    `## ${result.label}`,
    '',
    `Status: ${result.status}`,
    '',
    `Started: ${result.startedAt.toISOString()}`,
    '',
    `Finished: ${result.finishedAt.toISOString()}`,
    '',
    '```text',
    result.output || '(no output)',
    '```',
    '',
  ]),
].join('\n');

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, report);

console.log(`Testing evidence written to ${reportPath}`);

if (results.some((result) => result.status !== 'PASS')) {
  process.exitCode = 1;
}
