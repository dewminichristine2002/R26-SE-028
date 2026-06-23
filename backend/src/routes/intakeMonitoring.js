const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const getPythonCommand = (purpose) => {
  if (purpose === 'vision') {
    return process.env.INTAKE_VISION_PYTHON || process.env.PILL_ML_PYTHON || 'python';
  }
  return process.env.PILL_ML_PYTHON || process.env.INTAKE_ML_PYTHON || 'python';
};

const runPythonJsonScript = (scriptName, payload, timeoutMs = 20000, purpose = 'ml') =>
  new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', scriptName);
    const pythonCommand = getPythonCommand(purpose);
    const child = spawn(pythonCommand, [scriptPath], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: {
        ...process.env,
      },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${scriptName} timed out.`));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });

    child.stderr.on('data', (data) => {
      stderr += String(data);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(stdout || '{}');
        if (code !== 0 && parsed?.error) {
          reject(new Error(parsed.error));
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr || 'Palm photo analysis failed.'));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error(stderr || error.message || 'Invalid palm photo analysis response.'));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });

const runPalmAnalysis = (payload) => runPythonJsonScript('analyze_palm_pills.py', payload, 60000, 'ml');
const runMotionAnalysis = (payload) => runPythonJsonScript('analyze_intake_motion_rules.py', payload, 10000, 'vision');

const runPythonArgsScript = (scriptName, args, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', scriptName);
    const pythonCommand = getPythonCommand('vision');
    const child = spawn(pythonCommand, [scriptPath, ...args], {
      cwd: path.resolve(__dirname, '..', '..'),
      env: {
        ...process.env,
      },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${scriptName} timed out.`));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });

    child.stderr.on('data', (data) => {
      stderr += String(data);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `${scriptName} failed.`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const extractMotionFramesFromVideo = async ({ videoBase64, extension = 'mp4' }) => {
  const safeExtension = String(extension || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'mp4';
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eldermeds-motion-'));
  const videoPath = path.join(tempDir, `intake-motion.${safeExtension}`);
  const outputPath = path.join(tempDir, 'landmarks.json');

  try {
    const cleanBase64 = String(videoBase64 || '').includes(',')
      ? String(videoBase64).split(',', 2)[1]
      : String(videoBase64 || '');
    await fs.writeFile(videoPath, Buffer.from(cleanBase64, 'base64'));
    await runPythonArgsScript(
      'extract_mediapipe_motion_landmarks.py',
      ['--video', videoPath, '--output', outputPath, '--frame-step', '2'],
      60000
    );
    const parsed = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return {
      frames: Array.isArray(parsed?.frames) ? parsed.frames : [],
      extractionMode: parsed?.extractionMode || 'mediapipe',
      faceFrameCount: Number(parsed?.faceFrameCount) || 0,
      handFrameCount: Number(parsed?.handFrameCount) || 0,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

router.post('/analyze-palm', requireAuth, async (req, res) => {
  const imageBase64 = String(req.body?.imageBase64 || '').trim();
  const expectedCount = Number(req.body?.expectedCount);

  if (!imageBase64) {
    return res.status(400).json({ error: 'A palm photo is required.' });
  }

  if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
    return res.status(400).json({ error: 'expectedCount must be a positive number.' });
  }

  try {
    const result = await runPalmAnalysis({
      imageBase64,
      expectedCount,
    });

    return res.json(result);
  } catch (error) {
    console.error('[IntakeMonitoring] palm analysis error:', error?.message || error);
    return res.status(500).json({
      status: 'uncertain',
      detectedCount: 0,
      confidence: 0,
      error: 'Could not analyze the palm photo. Retake the photo with all tablets separated and clearly visible.',
    });
  }
});

router.post('/analyze-motion', requireAuth, async (req, res) => {
  const frames = Array.isArray(req.body?.frames) ? req.body.frames : [];

  if (frames.length === 0) {
    return res.status(400).json({
      error: 'Motion landmark frames are required.',
    });
  }

  try {
    const result = await runMotionAnalysis({
      frames,
      swallowConfirmed: !!req.body?.swallowConfirmed,
    });

    return res.json(result);
  } catch (error) {
    console.error('[IntakeMonitoring] motion analysis error:', error?.message || error);
    return res.status(500).json({
      status: 'uncertain',
      confidence: 0,
      handToMouthDetected: false,
      mouthPauseDetected: false,
      error: 'Could not analyze intake motion. Please use caregiver confirmation.',
    });
  }
});

router.post('/analyze-motion-video', requireAuth, async (req, res) => {
  const videoBase64 = String(req.body?.videoBase64 || '').trim();
  const extension = String(req.body?.extension || 'mp4').trim();

  if (!videoBase64) {
    return res.status(400).json({
      error: 'A motion video is required.',
    });
  }

  try {
    const extraction = await extractMotionFramesFromVideo({
      videoBase64,
      extension,
    });
    const frames = extraction.frames;

    if (!frames.length) {
      return res.status(422).json({
        status: 'uncertain',
        confidence: 0,
        handToMouthDetected: false,
        mouthPauseDetected: false,
        framesUsed: 0,
        error: 'Could not detect hand and mouth landmarks from the video. Record with face and hand clearly visible.',
      });
    }

    if (extraction.extractionMode === 'opencv-motion-fallback' && extraction.handFrameCount < 6) {
      return res.status(422).json({
        status: 'uncertain',
        confidence: 0,
        motionAvailable: false,
        handToMouthDetected: false,
        mouthPauseDetected: false,
        extractedFrameCount: frames.length,
        extractionMode: extraction.extractionMode,
        faceFrameCount: extraction.faceFrameCount,
        handFrameCount: extraction.handFrameCount,
        error: 'Could not track enough hand motion from the video. Record again with your hand clearly visible as it moves to your mouth.',
      });
    }

    const result = await runMotionAnalysis({
      frames,
      swallowConfirmed: !!req.body?.swallowConfirmed,
    });

    return res.json({
      ...result,
      extractedFrameCount: frames.length,
      extractionMode: extraction.extractionMode,
      faceFrameCount: extraction.faceFrameCount,
      handFrameCount: extraction.handFrameCount,
    });
  } catch (error) {
    console.error('[IntakeMonitoring] motion video analysis error:', error?.message || error);
    return res.status(500).json({
      status: 'uncertain',
      confidence: 0,
      handToMouthDetected: false,
      mouthPauseDetected: false,
      error: 'Could not analyze intake motion video. Install MediaPipe/OpenCV and record with face and hand visible.',
    });
  }
});

module.exports = router;
