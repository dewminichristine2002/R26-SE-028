const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const modelMetadata = require('../../ml/emotion_classifier/selected_model_metadata.json');

const SERVICE_URL = (process.env.EMOTION_ML_SERVICE_URL || 'http://localhost:8001').replace(/\/+$/, '');
const HEALTH_TIMEOUT_MS = Number(process.env.EMOTION_ML_HEALTH_TIMEOUT_MS || 1500);
const STARTUP_TIMEOUT_MS = Number(process.env.EMOTION_ML_STARTUP_TIMEOUT_MS || 120000);
const POLL_INTERVAL_MS = Number(process.env.EMOTION_ML_STARTUP_POLL_MS || 1000);
const EXPECTED_MODEL = process.env.EMOTION_MODEL_VERSION || 'minilm_logistic_regression_v4';
const SERVICE_DIR = path.resolve(__dirname, '../../ml/emotion_classifier');

let ownedChild = null;
let startupPromise = null;
let cleanupRegistered = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const autoStartEnabled = () => !['0', 'false', 'no', 'off'].includes(
  String(process.env.EMOTION_ML_SERVICE_AUTO_START ?? 'true').trim().toLowerCase(),
);

function getServiceUrl() { return SERVICE_URL; }

function parsedServiceUrl() {
  try { return new URL(SERVICE_URL); } catch (_) { return null; }
}

function isLocalService() {
  return ['localhost', '127.0.0.1', '::1'].includes(parsedServiceUrl()?.hostname);
}

function getBindHost() {
  const hostname = parsedServiceUrl()?.hostname;
  if (!hostname || hostname === 'localhost' || hostname === '::1') return '127.0.0.1';
  return hostname;
}

function getBindPort() {
  const parsed = parsedServiceUrl();
  const port = Number(parsed?.port || (parsed?.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid emotion ML service port in ${SERVICE_URL}`);
  }
  return String(port);
}

function expectedService(payload) {
  if (!payload || payload.service !== 'emotion_classifier') {
    return { ok: false, reason: 'identity_mismatch', message: 'The configured port is occupied by a service that is not the ElderMeds emotion classifier.' };
  }
  if (payload.ready !== true || payload.model_status !== 'ready') {
    return { ok: false, reason: 'not_ready', message: payload.error || 'The emotion classifier process is running but its model is not ready.' };
  }
  if (payload.artifact_integrity !== 'verified') {
    return { ok: false, reason: 'artifact_unverified', message: 'Emotion classifier did not confirm artifact checksum verification.' };
  }
  if (payload.model_version !== EXPECTED_MODEL) {
    return { ok: false, reason: 'model_mismatch', message: `Emotion classifier reports ${payload.model_version || 'no model version'}; expected ${EXPECTED_MODEL}.` };
  }
  const expectedClasses = modelMetadata.supported_classes || [];
  if (!Array.isArray(payload.supported_classes)
      || payload.supported_classes.length !== expectedClasses.length
      || expectedClasses.some((emotion) => !payload.supported_classes.includes(emotion))) {
    return { ok: false, reason: 'class_mismatch', message: 'Emotion classifier reports an unexpected class set.' };
  }
  return { ok: true };
}

async function inspectService() {
  try {
    const response = await axios.get(`${SERVICE_URL}/health`, { timeout: HEALTH_TIMEOUT_MS });
    const check = expectedService(response.data);
    return { available: check.ok, ...check, payload: response.data };
  } catch (error) {
    if (error.response?.data) {
      const check = expectedService(error.response.data);
      return { available: false, ...check, payload: error.response.data };
    }
    return { available: false, reason: 'unavailable', message: error.message };
  }
}

function pythonExecutable() {
  const explicit = process.env.EMOTION_ML_PYTHON || process.env.ML_SERVICE_PYTHON;
  if (explicit) {
    if ((explicit.includes(path.sep) || path.isAbsolute(explicit)) && !fs.existsSync(explicit)) {
      throw new Error(`Configured Python interpreter does not exist: ${explicit}`);
    }
    return explicit;
  }

  const localPython = process.platform === 'win32'
    ? path.join(SERVICE_DIR, '.venv', 'Scripts', 'python.exe')
    : path.join(SERVICE_DIR, '.venv', 'bin', 'python');
  if (fs.existsSync(localPython)) return localPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function stopOwnedChild() {
  if (ownedChild && !ownedChild.killed) ownedChild.kill();
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.once('exit', stopOwnedChild);
  process.once('SIGINT', () => { stopOwnedChild(); process.exit(130); });
  process.once('SIGTERM', () => { stopOwnedChild(); process.exit(143); });
}

function spawnEmotionService() {
  if (ownedChild && !ownedChild.killed) return ownedChild;
  const entry = path.join(SERVICE_DIR, 'api_service.py');
  if (!fs.existsSync(entry)) throw new Error(`Emotion service entry point not found: ${entry}`);

  const python = pythonExecutable();
  const args = ['-m', 'uvicorn', 'api_service:app', '--host', getBindHost(), '--port', getBindPort()];
  const child = spawn(python, args, {
    cwd: SERVICE_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ownedChild = child;
  child.stdout?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) console.log(`[Emotion ML service] ${line}`);
  });
  child.stderr?.on('data', (chunk) => {
    const line = String(chunk || '').trim();
    if (line) console.error(`[Emotion ML service] ${line}`);
  });
  child.once('exit', (code, signal) => {
    if (code && code !== 0) console.error(`[Emotion ML service] exited with code ${code}`);
    else if (signal) console.error(`[Emotion ML service] exited with signal ${signal}`);
    if (ownedChild === child) ownedChild = null;
    startupPromise = null;
  });
  child.once('error', (error) => {
    console.error(`[Emotion ML service] failed to start: ${error.message}`);
    if (ownedChild === child) ownedChild = null;
    startupPromise = null;
  });
  registerCleanup();
  console.log(`[Emotion ML service] starting ${python} ${args.join(' ')} in ${SERVICE_DIR}`);
  return child;
}

async function waitForEmotionService() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    const state = await inspectService();
    if (state.available) return state;
    if (state.reason === 'identity_mismatch' || state.reason === 'model_mismatch' || state.reason === 'class_mismatch') {
      throw new Error(state.message);
    }
    if (state.reason === 'not_ready' && state.payload?.error) throw new Error(state.message);
    if (!ownedChild) throw new Error(state.message || 'Emotion ML service process exited before readiness.');
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Emotion ML service did not become ready at ${SERVICE_URL} within ${STARTUP_TIMEOUT_MS}ms.`);
}

async function ensureEmotionMlServiceAvailable() {
  const initial = await inspectService();
  if (initial.available) return true;
  if (initial.reason === 'identity_mismatch' || initial.reason === 'model_mismatch' || initial.reason === 'class_mismatch') {
    throw new Error(initial.message);
  }
  if (!autoStartEnabled()) {
    throw new Error(`Emotion ML service is unavailable at ${SERVICE_URL}; auto-start is disabled.`);
  }
  if (!isLocalService()) {
    throw new Error(`Emotion ML service is unavailable at ${SERVICE_URL}; auto-start only works for localhost URLs.`);
  }
  if (!startupPromise) {
    startupPromise = (async () => {
      spawnEmotionService();
      await waitForEmotionService();
      console.log(`[Emotion ML service] ready at ${SERVICE_URL} using ${EXPECTED_MODEL}`);
      return true;
    })().catch((error) => {
      stopOwnedChild();
      startupPromise = null;
      throw error;
    });
  }
  return startupPromise;
}

async function stopEmotionMlService() {
  const child = ownedChild;
  if (!child) return;
  stopOwnedChild();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5000),
  ]);
  if (ownedChild === child) ownedChild = null;
  startupPromise = null;
}

module.exports = {
  ensureEmotionMlServiceAvailable,
  expectedService,
  getServiceUrl,
  inspectService,
  stopEmotionMlService,
};
