const { createWorker } = require('tesseract.js');
const { Jimp, JimpMime } = require('jimp');

let workerPromise = null;
let queue = Promise.resolve();
const SHARPEN_KERNEL = [
  [0, -1, 0],
  [-1, 5, -1],
  [0, -1, 0],
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getGrayAt = (image, x, y) => {
  const index = (image.bitmap.width * y + x) * 4;
  return image.bitmap.data[index];
};

const computeGrayStats = (image) => {
  const { width, height } = image.bitmap;
  if (!width || !height) {
    return { mean: 0, stdDev: 0 };
  }

  const stride = Math.max(1, Math.floor(Math.min(width, height) / 500));
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const gray = getGrayAt(image, x, y);
      sum += gray;
      sumSq += gray * gray;
      count += 1;
    }
  }

  if (count === 0) {
    return { mean: 0, stdDev: 0 };
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return { mean, stdDev: Math.sqrt(variance) };
};

const computeBlurScore = (image) => {
  const { width, height } = image.bitmap;
  if (width < 3 || height < 3) {
    return 0;
  }

  const stride = Math.max(1, Math.floor(Math.min(width, height) / 600));
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const center = getGrayAt(image, x, y);
      const laplacian =
        Math.abs(4 * center - getGrayAt(image, x - 1, y) - getGrayAt(image, x + 1, y) - getGrayAt(image, x, y - 1) - getGrayAt(image, x, y + 1));
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count += 1;
    }
  }

  if (count === 0) {
    return 0;
  }

  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return Number(Math.sqrt(variance).toFixed(2));
};

const detectContentBounds = (image) => {
  const { width, height } = image.bitmap;
  if (!width || !height) {
    return null;
  }

  const darkPixelThreshold = 242;
  const minDarkPixelsPerRow = Math.max(8, Math.floor(width * 0.01));
  const minDarkPixelsPerColumn = Math.max(8, Math.floor(height * 0.01));

  const rowHasInk = (y) => {
    let darkCount = 0;
    for (let x = 0; x < width; x += 1) {
      if (getGrayAt(image, x, y) < darkPixelThreshold) {
        darkCount += 1;
        if (darkCount >= minDarkPixelsPerRow) {
          return true;
        }
      }
    }
    return false;
  };

  const columnHasInk = (x) => {
    let darkCount = 0;
    for (let y = 0; y < height; y += 1) {
      if (getGrayAt(image, x, y) < darkPixelThreshold) {
        darkCount += 1;
        if (darkCount >= minDarkPixelsPerColumn) {
          return true;
        }
      }
    }
    return false;
  };

  let top = 0;
  while (top < height - 1 && !rowHasInk(top)) {
    top += 1;
  }

  let bottom = height - 1;
  while (bottom > top && !rowHasInk(bottom)) {
    bottom -= 1;
  }

  let left = 0;
  while (left < width - 1 && !columnHasInk(left)) {
    left += 1;
  }

  let right = width - 1;
  while (right > left && !columnHasInk(right)) {
    right -= 1;
  }

  const croppedWidth = right - left + 1;
  const croppedHeight = bottom - top + 1;
  if (croppedWidth <= 0 || croppedHeight <= 0) {
    return null;
  }

  if (croppedWidth > width * 0.98 && croppedHeight > height * 0.98) {
    return null;
  }

  const padX = Math.max(12, Math.floor(width * 0.02));
  const padY = Math.max(12, Math.floor(height * 0.02));
  const x = Math.max(0, left - padX);
  const y = Math.max(0, top - padY);
  const w = Math.min(width - x, croppedWidth + padX * 2);
  const h = Math.min(height - y, croppedHeight + padY * 2);

  return { x, y, w, h };
};

const assessImageQuality = (image) => {
  const grayscale = image.clone().greyscale();
  const { width, height } = grayscale.bitmap;
  const grayStats = computeGrayStats(grayscale);
  const blurScore = computeBlurScore(grayscale);
  const warnings = [];

  if (width < 900 || height < 900) {
    warnings.push('Small text area detected. Move closer so the prescription fills more of the frame.');
  }
  if (grayStats.stdDev < 42) {
    warnings.push('Low contrast detected. Use brighter lighting and avoid shadows on the prescription.');
  }
  if (blurScore < 45) {
    warnings.push('The photo looks blurry. Retake it with steadier hands and clearer focus.');
  }

  const status = blurScore < 45 || grayStats.stdDev < 32 ? 'poor' : blurScore < 85 || grayStats.stdDev < 52 ? 'fair' : 'good';
  return {
    width,
    height,
    contrastScore: Number(grayStats.stdDev.toFixed(2)),
    blurScore,
    status,
    tooBlurry: blurScore < 25,
    warnings,
  };
};

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: () => {},
    });
  }
  return workerPromise;
};

const runExclusive = (fn) => {
  const run = () => fn();
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
};

/**
 * Preprocesses the image to improve OCR quality:
 * - rotate/normalize orientation
 * - trim large blank borders
 * - upscale small images
 * - grayscale conversion
 * - contrast enhancement
 * - noise reduction (small blur)
 * - sharpening
 * - adaptive threshold-like binarization for clearer text
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ buffer: Buffer, applied: string[], quality: object }>}
 */
async function preprocessPrescriptionImage(imageBuffer) {
  const image = await Jimp.read(imageBuffer);
  const applied = [];

  if (typeof image.exifRotate === 'function') {
    image.exifRotate();
    applied.push('orientation_normalization');
  }

  const initialQuality = assessImageQuality(image);
  const contentGuide = image.clone().greyscale().normalize().contrast(0.25);
  const contentBounds = detectContentBounds(contentGuide);
  if (contentBounds) {
    image.crop(contentBounds);
    applied.push('page_trim');
  }

  const longestEdge = Math.max(image.bitmap.width, image.bitmap.height);
  if (longestEdge > 0 && longestEdge < 1600) {
    const scaleFactor = clamp(1600 / longestEdge, 1, 2.2);
    if (scaleFactor > 1.05) {
      image.scale(scaleFactor);
      applied.push('upscale');
    }
  }

  image.greyscale();
  applied.push('grayscale');
  image.normalize().contrast(0.45);
  applied.push('contrast_enhancement');
  image.blur(1);
  applied.push('noise_reduction');
  image.convolute(SHARPEN_KERNEL);
  applied.push('sharpen');

  const { mean, stdDev } = computeGrayStats(image);
  const threshold = clamp(Math.round(mean - stdDev * 0.1 + 18), 135, 195);

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (_x, _y, idx) {
    const value = this.bitmap.data[idx];
    const out = value > threshold ? 255 : 0;
    this.bitmap.data[idx] = out;
    this.bitmap.data[idx + 1] = out;
    this.bitmap.data[idx + 2] = out;
  });
  applied.push('binarization');

  return {
    buffer: await image.getBuffer(JimpMime.png),
    applied,
    quality: initialQuality,
  };
}

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ rawText: string, confidence: number, preprocessing: { applied: string[] }, quality: object }>}
 */
async function recognizePrescriptionImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return { rawText: '', confidence: 0, preprocessing: { applied: [] }, quality: { warnings: [], status: 'unknown' } };
  }

  return runExclusive(async () => {
    const worker = await getWorker();
    const { buffer: processedBuffer, applied, quality } = await preprocessPrescriptionImage(imageBuffer);
    const {
      data: { text, confidence },
    } = await worker.recognize(processedBuffer);
    const rawText = String(text || '').replace(/\r\n/g, '\n').trim();
    const finalWarnings = [...(quality?.warnings || [])];
    if (typeof confidence === 'number' && confidence < 55) {
      finalWarnings.push('OCR confidence is low. Review the detected text carefully before confirming medicine names.');
    }
    return {
      rawText,
      confidence: typeof confidence === 'number' ? confidence : 0,
      preprocessing: {
        applied,
      },
      quality: {
        ...(quality || {}),
        warnings: finalWarnings,
      },
    };
  });
}

module.exports = {
  recognizePrescriptionImage,
};
