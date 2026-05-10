const express = require('express');
const multer = require('multer');
const { recognizePrescriptionImage } = require('../services/prescriptionOcrService');
const { matchMedicinesFromText } = require('../services/medicationKnowledgeService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype && file.mimetype.startsWith('image/');
    if (!ok) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const uploadImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    return next();
  });
};

router.post('/ocr', uploadImage, async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'Image file is required (field name: image)' });
  }

  try {
    const { rawText, confidence, preprocessing } = await recognizePrescriptionImage(req.file.buffer);
    const matchedCandidates = matchMedicinesFromText(rawText);
    return res.json({
      rawText,
      confidence,
      preprocessing,
      matchedCandidates,
      message:
        rawText.length > 0
          ? 'Text extracted. The app will let you edit it before any safety check.'
          : 'No text was detected. Try a clearer photo or enter the prescription manually.',
    });
  } catch (e) {
    console.error('[prescriptions/ocr]', e);
    return res.status(500).json({
      error: 'OCR processing failed. Try a different image or enter text manually.',
    });
  }
});

module.exports = router;
