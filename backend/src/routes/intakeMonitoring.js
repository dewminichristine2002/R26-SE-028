const express = require('express');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const getPythonCommand = (purpose) => {
  if (purpose === 'vision') {
    return process.env.INTAKE_VISION_PYTHON || process.env.PILL_ML_PYTHON || 'python';
  }
  if (purpose === 'identity') {
    return process.env.TABLET_IDENTITY_PYTHON || process.env.PILL_ML_PYTHON || process.env.INTAKE_ML_PYTHON || 'python';
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
const runTabletIdentityAnalysis = (payload) => runPythonJsonScript('analyze_tablet_identity.py', payload, 60000, 'identity');
const runMotionAnalysis = (payload) => runPythonJsonScript('analyze_intake_motion_rules.py', payload, 10000, 'vision');

const quoteIdentifier = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

const resolveMedicineColumn = async (candidates) => {
  const result = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'medicines'
      AND column_name = ANY($1::text[])
    ORDER BY CASE column_name
      WHEN 'medicineName' THEN 1
      WHEN 'name' THEN 2
      WHEN 'medicine_name' THEN 3
      WHEN 'medicinename' THEN 4
      WHEN 'color' THEN 5
      WHEN 'medicineColor' THEN 6
      WHEN 'colour' THEN 7
      WHEN 'shape' THEN 8
      WHEN 'medicineShape' THEN 9
      ELSE 10
    END
    LIMIT 1;
  `, [candidates]);

  return result.rows[0]?.column_name || null;
};

const resolveMedicineNameColumn = async () => {
  const resolved = await resolveMedicineColumn(['medicineName', 'name', 'medicine_name', 'medicinename']);
  return resolved || 'medicineName';
};

const resolveMedicineColorColumn = async () => resolveMedicineColumn(['color', 'medicineColor', 'colour']);

const resolveMedicineShapeColumn = async () => resolveMedicineColumn(['shape', 'medicineShape']);

const getTabletIdentityCandidates = async (userId) => {
  const medicineNameColumn = await resolveMedicineNameColumn();
  const medicineColorColumn = await resolveMedicineColorColumn();
  const medicineShapeColumn = await resolveMedicineShapeColumn();

  const qName = quoteIdentifier(medicineNameColumn);
  const qColor = medicineColorColumn ? quoteIdentifier(medicineColorColumn) : null;
  const qShape = medicineShapeColumn ? quoteIdentifier(medicineShapeColumn) : null;

  const colorSelect = qColor
    ? `(SELECT BTRIM(m.${qColor}) FROM medicines m WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name)) LIMIT 1)`
    : `NULL::text`;

  const shapeSelect = qShape
    ? `(SELECT BTRIM(m.${qShape})
        FROM medicines m
        WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name))
          AND (
            (um.selected_color IS NULL OR BTRIM(um.selected_color) = '' OR ${qColor ? `LOWER(BTRIM(m.${qColor})) = LOWER(BTRIM(um.selected_color))` : 'TRUE'})
            AND (um.selected_shape IS NULL OR BTRIM(um.selected_shape) = '' OR LOWER(BTRIM(m.${qShape})) = LOWER(BTRIM(um.selected_shape)))
          )
        LIMIT 1)`
    : `NULL::text`;

  const result = await pool.query(
    `
      SELECT
        um.id,
        um.medicine_name,
        um.dosage_mg,
        COALESCE(NULLIF(BTRIM(um.selected_color), ''), ${colorSelect}) AS medicine_color,
        COALESCE(NULLIF(BTRIM(um.selected_shape), ''), ${shapeSelect}) AS medicine_shape
      FROM user_medications um
      WHERE um.user_id = $1
      ORDER BY um.created_at DESC;
    `,
    [userId]
  );

  return result.rows
    .map((row) => ({
      id: row.id,
      medicineName: row.medicine_name,
      dosageMg: row.dosage_mg,
      color: row.medicine_color || '',
      shape: row.medicine_shape || '',
    }))
    .filter((item) => item.medicineName);
};

const toPositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeExpectedMedicines = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const id = String(item?.id || item?.medicationId || '').trim();
      const expectedCount = toPositiveNumber(item?.expectedCount ?? item?.count, 0);
      const medicineName = String(item?.medicineName || 'Medicine').trim();
      if (!id || expectedCount <= 0) {
        return null;
      }

      return {
        id,
        medicineName,
        expectedCount,
        dosageMg: item?.dosageMg,
        color: item?.color || '',
        shape: item?.shape || '',
      };
    })
    .filter(Boolean);
};

const buildDetectedMedicineMap = (identityAnalysis) => {
  const detectedMap = new Map();
  const detectedMedicines = Array.isArray(identityAnalysis?.detectedMedicines)
    ? identityAnalysis.detectedMedicines
    : [];

  detectedMedicines.forEach((item) => {
    const id = String(item?.id || '').trim();
    const count = toPositiveNumber(item?.count, 0);
    if (!id || count <= 0) {
      return;
    }

    detectedMap.set(id, {
      id,
      medicineName: item?.medicineName || 'Medicine',
      dosageMg: item?.dosageMg,
      color: item?.color || '',
      shape: item?.shape || '',
      count,
      confidence: Number(item?.confidence) || 0,
      objectIndexes: Array.isArray(item?.objectIndexes) ? item.objectIndexes : [],
    });
  });

  const detectedObjects = Array.isArray(identityAnalysis?.detectedObjects)
    ? identityAnalysis.detectedObjects
    : [];

  detectedObjects.forEach((object, index) => {
    const match = object?.match || null;
    const id = String(match?.id || '').trim();
    const confidence = Number(match?.confidence ?? object?.confidence) || 0;
    if (!id || confidence <= 0 || detectedMap.has(id)) {
      return;
    }

    detectedMap.set(id, {
      id,
      medicineName: match?.medicineName || 'Medicine',
      dosageMg: match?.dosageMg,
      color: match?.color || object?.detectedColor || '',
      shape: match?.shape || object?.detectedShape || '',
      count: 1,
      confidence,
      objectIndexes: [Number(object?.objectIndex ?? index)],
    });
  });

  return detectedMap;
};

const normalizeAppearanceValue = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || ['unknown', 'not specified', 'none', 'n/a'].includes(normalized)) {
    return '';
  }
  return normalized === 'grey' ? 'gray' : normalized;
};

const getAppearanceMatchScore = (expectedMedicine, detectedAppearance = {}) => {
  const expectedColor = normalizeAppearanceValue(expectedMedicine?.color);
  const expectedShape = normalizeAppearanceValue(expectedMedicine?.shape);
  const detectedColor = normalizeAppearanceValue(detectedAppearance?.color);
  const detectedShape = normalizeAppearanceValue(detectedAppearance?.shape);
  let score = 0;

  if (expectedColor && detectedColor && expectedColor === detectedColor) {
    score += 0.58;
  } else if (expectedColor && detectedColor && ['gray', 'white'].includes(expectedColor) && ['gray', 'white'].includes(detectedColor)) {
    score += 0.32;
  }

  if (expectedShape && detectedShape && expectedShape === detectedShape) {
    score += 0.36;
  } else if (expectedShape && detectedShape && ['oval', 'capsule'].includes(expectedShape) && ['oval', 'capsule'].includes(detectedShape)) {
    score += 0.18;
  }

  return score;
};

const getBestScheduledIndexByAppearance = ({ expected, items, detectedAppearance, onlyMissing = false }) => {
  let bestIndex = -1;
  let bestScore = 0;
  let bestDetectedCount = Number.POSITIVE_INFINITY;

  expected.forEach((expectedMedicine, index) => {
    if (onlyMissing && Number(items[index]?.missingCount) <= 0) {
      return;
    }

    const score = getAppearanceMatchScore(expectedMedicine, detectedAppearance);
    const detectedCount = Number(items[index]?.detectedCount) || 0;
    if (score > bestScore || (score > 0 && score === bestScore && detectedCount < bestDetectedCount)) {
      bestScore = score;
      bestDetectedCount = detectedCount;
      bestIndex = index;
    }
  });

  return bestScore > 0 ? bestIndex : -1;
};

const getDetectedObjectAppearance = (object = {}) => {
  const match = object?.match || null;
  const firstCandidate = Array.isArray(object?.matches) ? object.matches[0] : null;
  return {
    color: object?.detectedColor || match?.color || firstCandidate?.color || '',
    shape: object?.detectedShape || match?.shape || firstCandidate?.shape || '',
  };
};

const hasDetectedAppearance = (appearance = {}) =>
  Boolean(normalizeAppearanceValue(appearance?.color) || normalizeAppearanceValue(appearance?.shape));

const pushAppearanceUnits = (queue, appearance, count) => {
  const normalizedCount = Math.max(0, Math.ceil(Number(count) || 0));
  for (let index = 0; index < normalizedCount; index += 1) {
    queue.push(appearance);
  }
};

const buildMedicineDoseAnalysis = ({ expectedMedicines, identityAnalysis, detectedCount }) => {
  const expected = normalizeExpectedMedicines(expectedMedicines);
  const detectedMap = buildDetectedMedicineMap(identityAnalysis);
  const detectedObjects = Array.isArray(identityAnalysis?.detectedObjects) ? identityAnalysis.detectedObjects : [];
  const unknownObjectCount = detectedObjects.filter((item) => !item?.match).length;
  const scheduledIds = new Set(expected.map((item) => item.id));
  const normalizedDetectedCount = toPositiveNumber(detectedCount, 0);

  const buildScheduledItem = ({ item, detected = null, detectedMedicineCount = 0, countOnlyFallback = false }) => {
    const requiredCount = item.expectedCount;
    const missingCount = Math.max(0, requiredCount - detectedMedicineCount);
    const extraCount = Math.max(0, detectedMedicineCount - requiredCount);
    let status = 'underdose';
    let message = `${item.medicineName}: missing. Detected ${detectedMedicineCount}, expected ${requiredCount}.`;

    if (Math.abs(detectedMedicineCount - requiredCount) <= 0.001 && detectedMedicineCount > 0) {
      status = 'correct';
      message = `${item.medicineName}: available in the correct count (${detectedMedicineCount}).`;
    } else if (detectedMedicineCount > requiredCount) {
      status = 'overdose';
      message = `${item.medicineName}: overdose. Detected ${detectedMedicineCount}, expected ${requiredCount}.`;
    } else if (detectedMedicineCount > 0) {
      message = `${item.medicineName}: missing ${missingCount}. Detected ${detectedMedicineCount}, expected ${requiredCount}.`;
    }

    return {
      key: `scheduled-${item.id}`,
      id: item.id,
      medicineName: item.medicineName,
      dosageMg: item.dosageMg,
      color: item.color,
      shape: item.shape,
      expectedCount: requiredCount,
      detectedCount: detectedMedicineCount,
      missingCount,
      extraCount,
      confidence: detected ? Number(detected.confidence) || 0 : countOnlyFallback ? 0 : null,
      status,
      countOnlyFallback,
      message,
    };
  };

  const items = expected.map((item) => {
    const detected = detectedMap.get(item.id);
    return buildScheduledItem({
      item,
      detected,
      detectedMedicineCount: Number(detected?.count) || 0,
      countOnlyFallback: false,
    });
  });

  const rebuildItemAt = (index, nextDetectedCount, countOnlyFallback = true) => {
    const expectedItem = expected.find((item) => item.id === items[index]?.id);
    if (!expectedItem) {
      return;
    }
    items[index] = buildScheduledItem({
      item: expectedItem,
      detected: detectedMap.get(expectedItem.id) || null,
      detectedMedicineCount: nextDetectedCount,
      countOnlyFallback,
    });
  };

  const rawTotalIdentified = Array.from(detectedMap.values()).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  const unscheduledDetectedCount = Array.from(detectedMap.entries())
    .filter(([id]) => !scheduledIds.has(id))
    .reduce((sum, [, item]) => sum + (Number(item.count) || 0), 0);
  const unassignedAppearances = [];

  detectedObjects.forEach((object) => {
    const match = object?.match || null;
    const id = String(match?.id || '').trim();
    if (!id || !scheduledIds.has(id)) {
      unassignedAppearances.push(getDetectedObjectAppearance(object));
    }
  });

  detectedMap.forEach((detected, id) => {
    if (!scheduledIds.has(id)) {
      pushAppearanceUnits(unassignedAppearances, {
        color: detected?.color || '',
        shape: detected?.shape || '',
      }, detected?.count);
    }
  });

  let unassignedCount = unscheduledDetectedCount + Math.max(0, normalizedDetectedCount - rawTotalIdentified);
  if (unassignedCount <= 0 && normalizedDetectedCount <= 0 && unknownObjectCount > 0) {
    unassignedCount = unknownObjectCount;
  }

  while (unassignedCount > 0) {
    const detectedAppearance = unassignedAppearances.shift() || {};
    const appearanceMatchedMissingIndex = getBestScheduledIndexByAppearance({
      expected,
      items,
      detectedAppearance,
      onlyMissing: true,
    });
    const missingIndex = appearanceMatchedMissingIndex >= 0
      ? appearanceMatchedMissingIndex
      : hasDetectedAppearance(detectedAppearance)
      ? -1
      : items.findIndex((item) => Number(item.missingCount) > 0);
    if (missingIndex < 0) {
      if (hasDetectedAppearance(detectedAppearance)) {
        unassignedAppearances.unshift(detectedAppearance);
      }
      break;
    }
    const assignCount = Math.min(unassignedCount, Number(items[missingIndex].missingCount) || 0, 1);
    rebuildItemAt(missingIndex, Number(items[missingIndex].detectedCount) + assignCount, true);
    unassignedCount -= assignCount;
  }

  while (unassignedCount > 0 && items.length > 0) {
    const detectedAppearance = unassignedAppearances.shift() || {};
    const appearanceMatchedIndex = getBestScheduledIndexByAppearance({
      expected,
      items,
      detectedAppearance,
      onlyMissing: false,
    });
    const overdoseIndex = items.findIndex((item) => Number(item.detectedCount) > 0);
    const targetIndex = appearanceMatchedIndex >= 0
      ? appearanceMatchedIndex
      : overdoseIndex >= 0
      ? overdoseIndex
      : 0;
    const assignCount = Math.min(unassignedCount, 1);
    rebuildItemAt(targetIndex, Number(items[targetIndex].detectedCount) + assignCount, true);
    unassignedCount -= assignCount;
  }

  const totalExpected = expected.reduce((sum, item) => sum + item.expectedCount, 0);
  const totalIdentified = items.reduce((sum, item) => sum + (Number(item.detectedCount) || 0), 0);
  const statuses = new Set(items.map((item) => item.status));
  const status = statuses.has('overdose')
    ? 'overdose'
    : statuses.has('underdose')
    ? 'underdose'
    : 'correct';

  return {
    status,
    items,
    totalExpected,
    totalDetected: Number(detectedCount) || 0,
    totalIdentified,
    unknownObjectCount,
  };
};

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
  const expectedMedicines = Array.isArray(req.body?.expectedMedicines) ? req.body.expectedMedicines : [];

  if (!imageBase64) {
    return res.status(400).json({ error: 'A palm photo is required.' });
  }

  if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
    return res.status(400).json({ error: 'expectedCount must be a positive number.' });
  }

  try {
    const [countResult, candidatesResult] = await Promise.all([
      runPalmAnalysis({
        imageBase64,
        expectedCount,
      }),
      getTabletIdentityCandidates(req.user.id),
    ]);

    let identityAnalysis = {
      status: 'unavailable',
      confidence: 0,
      matches: [],
      detectedObjects: [],
      detectedMedicines: [],
      error: 'Tablet identity analysis was not run.',
    };

    const scheduledMedicineIds = new Set(normalizeExpectedMedicines(expectedMedicines).map((item) => item.id));
    const identityCandidates = scheduledMedicineIds.size > 0
      ? candidatesResult.filter((candidate) => scheduledMedicineIds.has(String(candidate?.id || '').trim()))
      : candidatesResult;

    try {
      identityAnalysis = await runTabletIdentityAnalysis({
        imageBase64,
        candidates: identityCandidates,
      });
    } catch (identityError) {
      console.warn('[IntakeMonitoring] tablet identity analysis warning:', identityError?.message || identityError);
      identityAnalysis = {
        status: 'uncertain',
        confidence: 0,
        matches: [],
        detectedObjects: [],
        detectedMedicines: [],
        error: 'Could not identify medicines in this palm photo.',
      };
    }

    const medicineDoseAnalysis = buildMedicineDoseAnalysis({
      expectedMedicines,
      identityAnalysis,
      detectedCount: countResult?.detectedCount,
    });

    return res.json({
      ...countResult,
      identityAnalysis,
      detectedObjects: Array.isArray(identityAnalysis?.detectedObjects) ? identityAnalysis.detectedObjects : [],
      detectedMedicines: Array.isArray(identityAnalysis?.detectedMedicines) ? identityAnalysis.detectedMedicines : [],
      medicineDoseAnalysis,
      identityCandidateCount: identityCandidates.length,
    });
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
