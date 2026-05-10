const { createWorker } = require('tesseract.js');
const { Jimp, JimpMime } = require('jimp');

let workerPromise = null;
let queue = Promise.resolve();

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
 * - grayscale conversion
 * - contrast enhancement
 * - noise reduction (small blur)
 * - adaptive threshold-like binarization for clearer text
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>}
 */
async function preprocessPrescriptionImage(imageBuffer) {
  const image = await Jimp.read(imageBuffer);

  if (typeof image.exifRotate === 'function') {
    image.exifRotate();
  }

  image.greyscale().normalize().contrast(0.35).blur(1);

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (_x, _y, idx) {
    const value = this.bitmap.data[idx];
    const out = value > 170 ? 255 : 0;
    this.bitmap.data[idx] = out;
    this.bitmap.data[idx + 1] = out;
    this.bitmap.data[idx + 2] = out;
  });

  return image.getBuffer(JimpMime.png);
}

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ rawText: string, confidence: number, preprocessing: { applied: string[] } }>}
 */
async function recognizePrescriptionImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return { rawText: '', confidence: 0, preprocessing: { applied: [] } };
  }

  return runExclusive(async () => {
    const worker = await getWorker();
    const processedBuffer = await preprocessPrescriptionImage(imageBuffer);
    const {
      data: { text, confidence },
    } = await worker.recognize(processedBuffer);
    const rawText = String(text || '').replace(/\r\n/g, '\n').trim();
    return {
      rawText,
      confidence: typeof confidence === 'number' ? confidence : 0,
      preprocessing: {
        applied: [
          'orientation_normalization',
          'grayscale',
          'contrast_enhancement',
          'noise_reduction',
          'binarization',
        ],
      },
    };
  });
}

module.exports = {
  recognizePrescriptionImage,
};
