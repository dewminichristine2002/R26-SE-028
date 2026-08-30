const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const HEALTH_TIMEOUT_MS = Number(process.env.ML_SERVICE_HEALTH_TIMEOUT_MS || 1500);
const STARTUP_TIMEOUT_MS = Number(process.env.ML_SERVICE_STARTUP_TIMEOUT_MS || 90000);
const POLL_INTERVAL_MS = Number(process.env.ML_SERVICE_STARTUP_POLL_MS || 1500);

let childProcess = null;
let startupPromise = null;
let cleanupRegistered = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isAutoStartEnabled = () => {
  const value = String(process.env.ML_SERVICE_AUTO_START ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(value);
};

const getMlServiceUrl = () => ML_SERVICE_URL;

const parseMlUrl = () => {
  try {
    return new URL(ML_SERVICE_URL);
  } catch (_) {
    return null;
  }
};

const isLocalMlService = () => {
  const parsed = parseMlUrl();
  if (!parsed) {
    return false;
  }
  return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
};

const getHealthUrl = () => `${ML_SERVICE_URL}/health`;

const checkMlHealth = async () => {
  try {
    const response = await axios.get(getHealthUrl(), { timeout: HEALTH_TIMEOUT_MS });
    return response.status >= 200 && response.status < 300;
  } catch (_) {
    return false;
  }
};

const repoRoot = () => path.resolve(__dirname, '../../..');
const mlServiceDir = () => path.join(repoRoot(), 'ml-service');

const readVenvConfig = (venvDir) => {
  const configPath = path.join(venvDir, 'pyvenv.cfg');
  if (!fs.existsSync(configPath)) {
    return null;
  }

  const entries = {};
  const raw = fs.readFileSync(configPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      entries[key] = value;
    }
  }

  return entries;
};

const isUsableVirtualenvPython = (pythonPath) => {
  if (!fs.existsSync(pythonPath)) {
    return false;
  }

  const venvDir = path.dirname(path.dirname(pythonPath));
  const config = readVenvConfig(venvDir);
  if (!config) {
    return true;
  }

  const configuredExecutable = config.executable;
  if (configuredExecutable && !fs.existsSync(configuredExecutable)) {
    console.warn(
      `[ML service] ignoring local virtualenv at ${venvDir} because its base interpreter is missing: ${configuredExecutable}`,
    );
    return false;
  }

  const configuredHome = config.home;
  if (configuredHome && !fs.existsSync(configuredHome)) {
    console.warn(
      `[ML service] ignoring local virtualenv at ${venvDir} because its Python home is missing: ${configuredHome}`,
    );
    return false;
  }

  return true;
};

const pickPythonExecutable = () => {
  if (process.env.ML_SERVICE_PYTHON) {
    return process.env.ML_SERVICE_PYTHON;
  }

  const localVenv = process.platform === 'win32'
    ? path.join(mlServiceDir(), '.venv', 'Scripts', 'python.exe')
    : path.join(mlServiceDir(), '.venv', 'bin', 'python');

  if (isUsableVirtualenvPython(localVenv)) {
    return localVenv;
  }

  return process.platform === 'win32' ? 'python' : 'python3';
};

const getBindHost = () => {
  const parsed = parseMlUrl();
  if (!parsed || parsed.hostname === 'localhost') {
    return '127.0.0.1';
  }
  return parsed.hostname === '::1' ? '127.0.0.1' : parsed.hostname;
};

const getBindPort = () => {
  const parsed = parseMlUrl();
  const port = Number(parsed?.port || 8001);
  return Number.isInteger(port) && port > 0 ? String(port) : '8001';
};

const registerCleanup = () => {
  if (cleanupRegistered) {
    return;
  }
  cleanupRegistered = true;

  const stopChild = () => {
    if (childProcess && !childProcess.killed) {
      childProcess.kill();
    }
  };

  process.once('exit', stopChild);
  process.once('SIGINT', () => {
    stopChild();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    stopChild();
    process.exit(143);
  });
};

const spawnMlService = () => {
  if (childProcess && !childProcess.killed) {
    return childProcess;
  }

  const cwd = mlServiceDir();
  if (!fs.existsSync(cwd)) {
    throw new Error(`ML service directory not found at ${cwd}`);
  }

  const python = pickPythonExecutable();
  const args = [
    '-m',
    'uvicorn',
    'app.main:app',
    '--host',
    getBindHost(),
    '--port',
    getBindPort(),
  ];

  childProcess = spawn(python, args, {
    cwd,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout?.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      console.log(`[ML service] ${text}`);
    }
  });

  childProcess.stderr?.on('data', (chunk) => {
    const text = String(chunk || '').trim();
    if (text) {
      console.error(`[ML service] ${text}`);
    }
  });

  childProcess.once('exit', (code, signal) => {
    if (code != null && code !== 0) {
      console.error(`[ML service] exited with code ${code}`);
    } else if (signal) {
      console.error(`[ML service] exited with signal ${signal}`);
    }
    childProcess = null;
    startupPromise = null;
  });

  childProcess.once('error', (error) => {
    console.error(`[ML service] failed to start: ${error.message}`);
    childProcess = null;
    startupPromise = null;
  });

  registerCleanup();
  console.log(`[ML service] starting ${python} ${args.join(' ')} in ${cwd}`);
  return childProcess;
};

const waitForMlService = async () => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (await checkMlHealth()) {
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
};

const ensureMlServiceAvailable = async () => {
  if (await checkMlHealth()) {
    return true;
  }

  if (!isAutoStartEnabled()) {
    throw new Error(`ML service is unavailable at ${ML_SERVICE_URL}. Start it manually or enable ML_SERVICE_AUTO_START.`);
  }

  if (!isLocalMlService()) {
    throw new Error(`ML service is unavailable at ${ML_SERVICE_URL}. Auto-start only works for localhost URLs.`);
  }

  if (!startupPromise) {
    startupPromise = (async () => {
      spawnMlService();
      const ready = await waitForMlService();
      if (!ready) {
        throw new Error(`ML service did not become ready at ${ML_SERVICE_URL} within ${STARTUP_TIMEOUT_MS}ms.`);
      }
      console.log(`[ML service] ready at ${ML_SERVICE_URL}`);
      return true;
    })();
  }

  return startupPromise;
};

const startMlServiceInBackground = () => {
  if (!isAutoStartEnabled() || !isLocalMlService()) {
    return;
  }

  ensureMlServiceAvailable().catch((error) => {
    console.error(`[ML service] background startup failed: ${error.message}`);
  });
};

module.exports = {
  checkMlHealth,
  ensureMlServiceAvailable,
  getMlServiceUrl,
  startMlServiceInBackground,
};
