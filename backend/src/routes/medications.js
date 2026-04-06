const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

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
      ELSE 5
    END
    LIMIT 1;
  `, [candidates]);

  return result.rows[0]?.column_name || null;
};

const resolveMedicineNameColumn = async () => {
  const resolved = await resolveMedicineColumn(['medicineName', 'name', 'medicine_name', 'medicinename']);
  return resolved || 'medicineName';
};

const resolveMedicineColorColumn = async () => {
  return resolveMedicineColumn(['color']);
};

const resolveMedicineShapeColumn = async () => {
  return resolveMedicineColumn(['shape']);
};

const getAvailableColorsForMedicineName = async (medicineName) => {
  const medicineNameColumn = await resolveMedicineNameColumn();
  const medicineColorColumn = await resolveMedicineColorColumn();

  if (!medicineColorColumn) {
    return [];
  }

  const qName = quoteIdentifier(medicineNameColumn);
  const qColor = quoteIdentifier(medicineColorColumn);

  const sql = `
    SELECT MIN(BTRIM(${qColor})) AS color
    FROM medicines
    WHERE LOWER(BTRIM(${qName})) = LOWER(BTRIM($1))
      AND ${qColor} IS NOT NULL
      AND BTRIM(${qColor}) <> ''
    GROUP BY LOWER(BTRIM(${qColor}))
    ORDER BY MIN(BTRIM(${qColor})) ASC;
  `;

  const result = await pool.query(sql, [medicineName]);
  return result.rows.map((row) => row.color).filter(Boolean);
};

const getAvailableAppearancesForMedicineName = async (medicineName) => {
  const medicineNameColumn = await resolveMedicineNameColumn();
  const medicineColorColumn = await resolveMedicineColorColumn();
  const medicineShapeColumn = await resolveMedicineShapeColumn();

  if (!medicineColorColumn || !medicineShapeColumn) {
    return [];
  }

  const qName = quoteIdentifier(medicineNameColumn);
  const qColor = quoteIdentifier(medicineColorColumn);
  const qShape = quoteIdentifier(medicineShapeColumn);

  const sql = `
    SELECT
      MIN(BTRIM(${qColor})) AS color,
      MIN(BTRIM(${qShape})) AS shape
    FROM medicines
    WHERE LOWER(BTRIM(${qName})) = LOWER(BTRIM($1))
      AND ${qColor} IS NOT NULL
      AND BTRIM(${qColor}) <> ''
      AND ${qShape} IS NOT NULL
      AND BTRIM(${qShape}) <> ''
    GROUP BY LOWER(BTRIM(${qColor})), LOWER(BTRIM(${qShape}))
    ORDER BY MIN(BTRIM(${qColor})) ASC, MIN(BTRIM(${qShape})) ASC;
  `;

  const result = await pool.query(sql, [medicineName]);
  return result.rows.map((row) => ({ color: row.color, shape: row.shape })).filter((row) => row.color && row.shape);
};

router.get('/suggestions', async (req, res) => {
  const rawQuery = (req.query.q || '').toString().trim();

  if (!rawQuery) {
    return res.json({ suggestions: [] });
  }

  try {
    const medicineNameColumn = await resolveMedicineNameColumn();
    const qName = quoteIdentifier(medicineNameColumn);
    const sql = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY grouped.name) :: text AS id,
        grouped.name
      FROM (
        SELECT MIN(BTRIM(${qName})) AS name
        FROM medicines
        WHERE ${qName} ILIKE $1
          AND ${qName} IS NOT NULL
          AND BTRIM(${qName}) <> ''
        GROUP BY LOWER(BTRIM(${qName}))
      ) AS grouped
      ORDER BY grouped.name ASC
      LIMIT 10;
    `;

    const result = await pool.query(sql, [`%${rawQuery}%`]);
    return res.json({ suggestions: result.rows });
  } catch (error) {
    console.error('[Medications] suggestions error:', error.message);
    return res.status(500).json({ error: 'Failed to load medicine suggestions' });
  }
});

router.get('/colors', async (req, res) => {
  const medicineName = (req.query.medicineName || '').toString().trim();
  if (!medicineName) {
    return res.json({ colors: [] });
  }

  try {
    const colors = await getAvailableColorsForMedicineName(medicineName);
    return res.json({ colors });
  } catch (error) {
    console.error('[Medications] colors error:', error.message);
    return res.status(500).json({ error: 'Failed to load medicine colors' });
  }
});

router.get('/appearances', async (req, res) => {
  const medicineName = (req.query.medicineName || '').toString().trim();
  if (!medicineName) {
    return res.json({ appearances: [] });
  }

  try {
    const appearances = await getAvailableAppearancesForMedicineName(medicineName);
    return res.json({ appearances });
  } catch (error) {
    console.error('[Medications] appearances error:', error.message);
    return res.status(500).json({ error: 'Failed to load medicine appearances' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const {
    medicineName,
    selectedColor,
    selectedShape,
    totalQuantity,
    dosageMg,
    dailyAmount,
    doseForm,
    takeWith,
    intakeTiming,
  } = req.body || {};

  const normalizedMedicineName = (medicineName || '').toString().trim();
  const normalizedSelectedColor = (selectedColor || '').toString().trim();
  const normalizedSelectedShape = (selectedShape || '').toString().trim();
  const normalizedDoseForm = (doseForm || '').toString().trim();
  const normalizedTakeWith = (takeWith || '').toString().trim();
  const normalizedIntakeTiming = (intakeTiming || '').toString().trim();

  const parsedTotalQuantity = Number(totalQuantity);
  const parsedDosageMg = Number(dosageMg);
  const parsedDailyAmount = Number(dailyAmount);

  if (
    !normalizedMedicineName ||
    !Number.isFinite(parsedTotalQuantity) || parsedTotalQuantity <= 0 ||
    !Number.isFinite(parsedDosageMg) || parsedDosageMg <= 0 ||
    !Number.isFinite(parsedDailyAmount) || parsedDailyAmount <= 0 ||
    !normalizedDoseForm ||
    !normalizedTakeWith ||
    !normalizedIntakeTiming
  ) {
    return res.status(400).json({ error: 'All fields are required with valid values' });
  }

  try {
    const appearances = await getAvailableAppearancesForMedicineName(normalizedMedicineName);
    const availableColors = await getAvailableColorsForMedicineName(normalizedMedicineName);

    if (availableColors.length > 1 && !normalizedSelectedColor) {
      return res.status(400).json({ error: 'Please select a color for this medicine' });
    }

    if (
      normalizedSelectedColor &&
      availableColors.length > 0 &&
      !availableColors.some((color) => color.toLowerCase() === normalizedSelectedColor.toLowerCase())
    ) {
      return res.status(400).json({ error: 'Selected color is not valid for this medicine' });
    }

    if (appearances.length > 1 && (!normalizedSelectedColor || !normalizedSelectedShape)) {
      return res.status(400).json({ error: 'Please confirm both color and shape for this medicine' });
    }

    if (
      normalizedSelectedColor && normalizedSelectedShape && appearances.length > 0 &&
      !appearances.some(
        (item) =>
          item.color.toLowerCase() === normalizedSelectedColor.toLowerCase() &&
          item.shape.toLowerCase() === normalizedSelectedShape.toLowerCase()
      )
    ) {
      return res.status(400).json({ error: 'Selected color and shape combination is not valid for this medicine' });
    }

    const sql = `
      INSERT INTO user_medications (
        user_id,
        medicine_name,
        selected_color,
        selected_shape,
        total_quantity,
        dosage_mg,
        daily_amount,
        dose_form,
        take_with,
        intake_timing
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, medicine_name, selected_color, selected_shape, total_quantity, dosage_mg, daily_amount, dose_form, take_with, intake_timing, created_at;
    `;

    const result = await pool.query(sql, [
      req.user.id,
      normalizedMedicineName,
      normalizedSelectedColor || null,
      normalizedSelectedShape || null,
      parsedTotalQuantity,
      parsedDosageMg,
      parsedDailyAmount,
      normalizedDoseForm,
      normalizedTakeWith,
      normalizedIntakeTiming,
    ]);

    return res.status(201).json({ medication: result.rows[0] });
  } catch (error) {
    console.error('[Medications] create error:', error.message);
    return res.status(500).json({ error: 'Failed to save medication' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const medicineNameColumn = await resolveMedicineNameColumn();
    const medicineColorColumn = await resolveMedicineColorColumn();
    const medicineShapeColumn = await resolveMedicineShapeColumn();

    const qName = quoteIdentifier(medicineNameColumn);
    const qColor = medicineColorColumn ? quoteIdentifier(medicineColorColumn) : null;
    const qShape = medicineShapeColumn ? quoteIdentifier(medicineShapeColumn) : null;

    const colorSelect = qColor
      ? `(SELECT BTRIM(m.${qColor}) FROM medicines m WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name)) LIMIT 1) AS medicine_color`
      : `NULL::text AS medicine_color`;

    const shapeSelect = qShape
      ? `(SELECT BTRIM(m.${qShape})
          FROM medicines m
          WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name))
            AND (
              (um.selected_color IS NULL OR BTRIM(um.selected_color) = '' OR ${qColor ? `LOWER(BTRIM(m.${qColor})) = LOWER(BTRIM(um.selected_color))` : 'TRUE'})
              AND (um.selected_shape IS NULL OR BTRIM(um.selected_shape) = '' OR LOWER(BTRIM(m.${qShape})) = LOWER(BTRIM(um.selected_shape)))
            )
          LIMIT 1) AS medicine_shape`
      : `NULL::text AS medicine_shape`;

    const sql = `
      SELECT
        um.id,
        um.medicine_name,
        um.selected_color,
        um.selected_shape,
        um.total_quantity,
        um.dosage_mg,
        um.daily_amount,
        um.dose_form,
        um.take_with,
        um.intake_timing,
        um.created_at,
        um.updated_at,
        COALESCE(NULLIF(BTRIM(um.selected_color), ''), ${colorSelect.replace(' AS medicine_color', '')}) AS medicine_color,
        ${shapeSelect}
      FROM user_medications um
      WHERE um.user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(sql, [req.user.id]);
    return res.json({ medications: result.rows });
  } catch (error) {
    console.error('[Medications] list error:', error.message);
    return res.status(500).json({ error: 'Failed to load medications' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const medicineNameColumn = await resolveMedicineNameColumn();
    const medicineColorColumn = await resolveMedicineColorColumn();
    const medicineShapeColumn = await resolveMedicineShapeColumn();

    const qName = quoteIdentifier(medicineNameColumn);
    const qColor = medicineColorColumn ? quoteIdentifier(medicineColorColumn) : null;
    const qShape = medicineShapeColumn ? quoteIdentifier(medicineShapeColumn) : null;

    const colorSelect = qColor
      ? `(SELECT BTRIM(m.${qColor}) FROM medicines m WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name)) LIMIT 1) AS medicine_color`
      : `NULL::text AS medicine_color`;

    const shapeSelect = qShape
      ? `(SELECT BTRIM(m.${qShape})
          FROM medicines m
          WHERE LOWER(BTRIM(m.${qName})) = LOWER(BTRIM(um.medicine_name))
            AND (
              (um.selected_color IS NULL OR BTRIM(um.selected_color) = '' OR ${qColor ? `LOWER(BTRIM(m.${qColor})) = LOWER(BTRIM(um.selected_color))` : 'TRUE'})
              AND (um.selected_shape IS NULL OR BTRIM(um.selected_shape) = '' OR LOWER(BTRIM(m.${qShape})) = LOWER(BTRIM(um.selected_shape)))
            )
          LIMIT 1) AS medicine_shape`
      : `NULL::text AS medicine_shape`;

    const sql = `
      SELECT
        um.id,
        um.medicine_name,
        um.selected_color,
        um.selected_shape,
        um.total_quantity,
        um.dosage_mg,
        um.daily_amount,
        um.dose_form,
        um.take_with,
        um.intake_timing,
        um.created_at,
        um.updated_at,
        COALESCE(NULLIF(BTRIM(um.selected_color), ''), ${colorSelect.replace(' AS medicine_color', '')}) AS medicine_color,
        ${shapeSelect}
      FROM user_medications um
      WHERE um.id = $1 AND um.user_id = $2
      LIMIT 1;
    `;
    const result = await pool.query(sql, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    return res.json({ medication: result.rows[0] });
  } catch (error) {
    console.error('[Medications] detail error:', error.message);
    return res.status(500).json({ error: 'Failed to load medication' });
  }
});

router.put('/:id', requireAuth, async (req, res) => {
  const {
    medicineName,
    selectedColor,
    selectedShape,
    totalQuantity,
    dosageMg,
    dailyAmount,
    doseForm,
    takeWith,
    intakeTiming,
  } = req.body || {};

  const normalizedMedicineName = (medicineName || '').toString().trim();
  const normalizedSelectedColor = (selectedColor || '').toString().trim();
  const normalizedSelectedShape = (selectedShape || '').toString().trim();
  const normalizedDoseForm = (doseForm || '').toString().trim();
  const normalizedTakeWith = (takeWith || '').toString().trim();
  const normalizedIntakeTiming = (intakeTiming || '').toString().trim();

  const parsedTotalQuantity = Number(totalQuantity);
  const parsedDosageMg = Number(dosageMg);
  const parsedDailyAmount = Number(dailyAmount);

  if (
    !normalizedMedicineName ||
    !Number.isFinite(parsedTotalQuantity) || parsedTotalQuantity <= 0 ||
    !Number.isFinite(parsedDosageMg) || parsedDosageMg <= 0 ||
    !Number.isFinite(parsedDailyAmount) || parsedDailyAmount <= 0 ||
    !normalizedDoseForm ||
    !normalizedTakeWith ||
    !normalizedIntakeTiming
  ) {
    return res.status(400).json({ error: 'All fields are required with valid values' });
  }

  try {
    const appearances = await getAvailableAppearancesForMedicineName(normalizedMedicineName);
    const availableColors = await getAvailableColorsForMedicineName(normalizedMedicineName);

    if (availableColors.length > 1 && !normalizedSelectedColor) {
      return res.status(400).json({ error: 'Please select a color for this medicine' });
    }

    if (
      normalizedSelectedColor &&
      availableColors.length > 0 &&
      !availableColors.some((color) => color.toLowerCase() === normalizedSelectedColor.toLowerCase())
    ) {
      return res.status(400).json({ error: 'Selected color is not valid for this medicine' });
    }

    if (appearances.length > 1 && (!normalizedSelectedColor || !normalizedSelectedShape)) {
      return res.status(400).json({ error: 'Please confirm both color and shape for this medicine' });
    }

    if (
      normalizedSelectedColor && normalizedSelectedShape && appearances.length > 0 &&
      !appearances.some(
        (item) =>
          item.color.toLowerCase() === normalizedSelectedColor.toLowerCase() &&
          item.shape.toLowerCase() === normalizedSelectedShape.toLowerCase()
      )
    ) {
      return res.status(400).json({ error: 'Selected color and shape combination is not valid for this medicine' });
    }

    const sql = `
      UPDATE user_medications
      SET
        medicine_name = $1,
        selected_color = $2,
        selected_shape = $3,
        total_quantity = $4,
        dosage_mg = $5,
        daily_amount = $6,
        dose_form = $7,
        take_with = $8,
        intake_timing = $9,
        updated_at = NOW()
      WHERE id = $10 AND user_id = $11
      RETURNING id, medicine_name, selected_color, selected_shape, total_quantity, dosage_mg, daily_amount, dose_form, take_with, intake_timing, created_at, updated_at;
    `;
    const result = await pool.query(sql, [
      normalizedMedicineName,
      normalizedSelectedColor || null,
      normalizedSelectedShape || null,
      parsedTotalQuantity,
      parsedDosageMg,
      parsedDailyAmount,
      normalizedDoseForm,
      normalizedTakeWith,
      normalizedIntakeTiming,
      req.params.id,
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    return res.json({ medication: result.rows[0] });
  } catch (error) {
    console.error('[Medications] update error:', error.message);
    return res.status(500).json({ error: 'Failed to update medication' });
  }
});

module.exports = router;
