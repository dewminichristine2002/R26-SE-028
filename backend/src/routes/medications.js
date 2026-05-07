const express = require('express');
const { requireDatabase } = require('../middleware/databaseMiddleware');
const { requireAuth } = require('../middleware/authMiddleware');
const { searchMedications, enrichMedication } = require('../services/medicationKnowledgeService');
const { pool } = require('../config/db');

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

const computeStockSnapshot = (medicationRow) => {
  const pillsLeft = Math.max(0, Number(medicationRow?.total_quantity) || 0);
  const dailyIntake = Math.max(1, Number(medicationRow?.daily_amount) || 1);
  const daysLeftRaw = pillsLeft / dailyIntake;
  const daysLeft = Math.max(0, Math.ceil(daysLeftRaw));

  const refillDate = new Date();
  refillDate.setDate(refillDate.getDate() + daysLeft);

  const coveragePercent = Math.max(1, Math.min(100, Math.round((daysLeft / 30) * 100)));
  const isLowStock = daysLeftRaw <= 3;

  let stockLabel = 'Stock OK';
  if (daysLeftRaw <= 3) {
    stockLabel = 'Low Stock';
  } else if (daysLeftRaw <= 7) {
    stockLabel = 'Refill Soon';
  }

  return {
    pillsLeft,
    dailyIntake,
    daysLeft,
    daysLeftRaw,
    coveragePercent,
    isLowStock,
    stockLabel,
    refillDate,
  };
};

const createLowStockCaregiverAlert = async ({
  userId,
  medication,
  daysLeft,
  manual,
}) => {
  const ownerResult = await pool.query(
    `
      SELECT full_name, caregiver_email, caregiver_phone
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [userId]
  );

  const owner = ownerResult.rows[0] || {};
  const caregiverEmail = String(owner?.caregiver_email || '').trim();
  const caregiverPhone = String(owner?.caregiver_phone || '').trim();

  if (!caregiverEmail) {
    return { created: false, reason: 'no-caregiver' };
  }

  if (!manual) {
    const recent = await pool.query(
      `
        SELECT id
        FROM caregiver_alerts
        WHERE user_id = $1
          AND medication_id = $2
          AND title = 'Low Stock Alert'
          AND created_at >= NOW() - INTERVAL '24 hours'
        LIMIT 1
      `,
      [userId, medication.id]
    );

    if (recent.rows.length > 0) {
      return { created: false, reason: 'already-notified-recently' };
    }
  }

  const patientName = String(owner?.full_name || 'Patient').trim();
  const medicineName = String(medication?.medicine_name || 'medicine').trim();
  const modeText = manual ? 'Manual request' : 'Auto alert';

  await pool.query(
    `
      INSERT INTO caregiver_alerts (
        user_id,
        medication_id,
        caregiver_email,
        caregiver_phone,
        title,
        message
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      userId,
      medication.id,
      caregiverEmail,
      caregiverPhone || null,
      'Low Stock Alert',
      `${modeText}: ${patientName} has low stock for ${medicineName}. Only ${daysLeft} day(s) left.`,
    ]
  );

  return { created: true, reason: 'ok' };
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

    if (result.rows.length > 0) {
      await pool.query(
        `
          INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
          VALUES ($1, $2, $3, $3)
          ON CONFLICT (medication_id) DO UPDATE
          SET
            user_id = EXCLUDED.user_id,
            initial_quantity = EXCLUDED.initial_quantity,
            current_quantity = EXCLUDED.current_quantity,
            updated_at = NOW();
        `,
        [req.user.id, result.rows[0].id, parsedTotalQuantity]
      );
    }

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
        COALESCE(ms.current_quantity, um.total_quantity) AS total_quantity,
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
      LEFT JOIN medication_stock ms ON ms.medication_id = um.id
      WHERE um.user_id = $1
      ORDER BY um.created_at DESC;
    `;
    const result = await pool.query(sql, [req.user.id]);
    return res.json({ medications: result.rows });
  } catch (error) {
    console.error('[Medications] list error:', error.message);
    return res.status(500).json({ error: 'Failed to load medications' });
  }
});

router.post('/status-events', requireAuth, async (req, res) => {
  const {
    medicationId,
    status,
    overdoseTablets,
    scheduleSlot,
    doseNumber,
    timesPerDay,
    routineTime,
    reminderTime,
    eventTime,
  } = req.body || {};

  const parsedMedicationId = Number(medicationId);
  const parsedOverdoseTablets = overdoseTablets == null ? null : Number(overdoseTablets);
  const parsedDoseNumber = doseNumber == null ? null : Number(doseNumber);
  const parsedTimesPerDay = timesPerDay == null ? null : Number(timesPerDay);
  const normalizedStatus = String(status || '').toLowerCase().trim();
  const normalizedScheduleSlot = String(scheduleSlot || '').trim();
  const normalizedRoutineTime = String(routineTime || '').trim();

  const validStatuses = ['taken', 'remind', 'overdose', 'speak', 'not-taken'];
  if (!Number.isInteger(parsedMedicationId) || parsedMedicationId <= 0) {
    return res.status(400).json({ error: 'Valid medicationId is required' });
  }

  if (!validStatuses.includes(normalizedStatus)) {
    return res.status(400).json({ error: 'Status must be taken, remind, overdose, speak, or not-taken' });
  }

  if (parsedDoseNumber != null && (!Number.isInteger(parsedDoseNumber) || parsedDoseNumber <= 0)) {
    return res.status(400).json({ error: 'doseNumber must be a positive integer when provided' });
  }

  if (parsedTimesPerDay != null && (!Number.isInteger(parsedTimesPerDay) || parsedTimesPerDay <= 0)) {
    return res.status(400).json({ error: 'timesPerDay must be a positive integer when provided' });
  }

  if (normalizedStatus === 'overdose') {
    if (!Number.isFinite(parsedOverdoseTablets) || parsedOverdoseTablets <= 0) {
      return res.status(400).json({ error: 'overdoseTablets is required for overdose and must be a positive number' });
    }
  }

  let parsedReminderTime = null;
  if (reminderTime) {
    const candidate = new Date(reminderTime);
    if (Number.isNaN(candidate.getTime())) {
      return res.status(400).json({ error: 'reminderTime must be a valid date/time string' });
    }
    parsedReminderTime = candidate.toISOString();
  }

  let parsedEventTime = null;
  if (eventTime) {
    const candidate = new Date(eventTime);
    if (Number.isNaN(candidate.getTime())) {
      return res.status(400).json({ error: 'eventTime must be a valid date/time string' });
    }
    parsedEventTime = candidate.toISOString();
  }

  try {
    const medicationMetaResult = await pool.query(
      `
        SELECT id, medicine_name, daily_amount
        FROM user_medications
        WHERE id = $1 AND user_id = $2
        LIMIT 1
      `,
      [parsedMedicationId, req.user.id]
    );

    if (medicationMetaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const medicationMeta = medicationMetaResult.rows[0];
    const baseDoseAmount = Math.max(0, Number(medicationMeta?.daily_amount) || 0);
    const overdoseExtra = normalizedStatus === 'overdose'
      ? Math.max(0, Number(parsedOverdoseTablets) || 0)
      : 0;
    const totalUsedQuantity = (normalizedStatus === 'taken' || normalizedStatus === 'overdose')
      ? baseDoseAmount + overdoseExtra
      : 0;

    const sql = `
      INSERT INTO medication_status_events (
        user_id,
        medication_id,
        status,
        overdose_tablets,
        quantity_used,
        schedule_slot,
        dose_number,
        times_per_day,
        routine_time,
        reminder_time,
        event_time
      )
      SELECT
        $1,
        um.id,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        COALESCE($11::timestamptz, NOW())
      FROM user_medications um
      WHERE um.id = $2 AND um.user_id = $1
      RETURNING id, user_id, medication_id, status, overdose_tablets, quantity_used, schedule_slot, dose_number, times_per_day, routine_time, reminder_time, event_time, created_at;
    `;

    const result = await pool.query(sql, [
      req.user.id,
      parsedMedicationId,
      normalizedStatus,
      normalizedStatus === 'overdose' ? parsedOverdoseTablets : null,
      totalUsedQuantity,
      normalizedScheduleSlot || null,
      parsedDoseNumber,
      parsedTimesPerDay,
      normalizedRoutineTime || null,
      parsedReminderTime,
      parsedEventTime,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    if (normalizedStatus === 'taken' || normalizedStatus === 'overdose') {
      try {
        if (totalUsedQuantity > 0) {
          await pool.query(
            `
              UPDATE user_medications
              SET
                updated_at = NOW()
              WHERE id = $1 AND user_id = $2
            `,
            [parsedMedicationId, req.user.id]
          );

          await pool.query(
            `
              UPDATE medication_stock
              SET
                current_quantity = GREATEST(0::numeric, current_quantity - $3::numeric),
                updated_at = NOW()
              WHERE medication_id = $1 AND user_id = $2
            `,
            [parsedMedicationId, req.user.id, totalUsedQuantity]
          );
        }
      } catch (stockError) {
        console.error('[Medications] stock decrement error:', stockError.message);
      }
    }

    if (normalizedStatus === 'overdose') {
      try {
        const ownerResult = await pool.query(
          `
            SELECT full_name, caregiver_email, caregiver_phone
            FROM users
            WHERE id = $1
            LIMIT 1
          `,
          [req.user.id]
        );

        const owner = ownerResult.rows[0] || {};
        const caregiverEmail = String(owner?.caregiver_email || '').trim();
        const caregiverPhone = String(owner?.caregiver_phone || '').trim();

        if (caregiverEmail) {
          const patientName = String(owner?.full_name || 'Patient').trim();
          const medicineName = String(medicationMeta?.medicine_name || 'medicine').trim();
          const tabletsText = Number.isFinite(parsedOverdoseTablets) ? parsedOverdoseTablets : 0.5;

          await pool.query(
            `
              INSERT INTO caregiver_alerts (
                user_id,
                status_event_id,
                medication_id,
                caregiver_email,
                caregiver_phone,
                title,
                message
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              req.user.id,
              result.rows[0].id,
              parsedMedicationId,
              caregiverEmail,
              caregiverPhone || null,
              'Overdose Alert',
              `${patientName} reported an overdose for ${medicineName} (${tabletsText} tablets).`,
            ]
          );
        }
      } catch (alertError) {
        console.error('[Medications] caregiver alert create error:', alertError.message);
      }
    }

    return res.status(201).json({ statusEvent: result.rows[0] });
  } catch (error) {
    console.error('[Medications] status event create error:', error.message);
    return res.status(500).json({ error: 'Failed to save medication status event' });
  }
});

router.get('/status-events/today-latest', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT DISTINCT ON (
          medication_id,
          COALESCE(schedule_slot, ''),
          COALESCE(dose_number, 0)
        )
          medication_id,
          status,
          overdose_tablets,
          schedule_slot,
          dose_number,
          times_per_day,
          event_time,
          created_at
        FROM medication_status_events
        WHERE user_id = $1
          AND event_time::date = CURRENT_DATE
        ORDER BY
          medication_id,
          COALESCE(schedule_slot, ''),
          COALESCE(dose_number, 0),
          event_time DESC,
          id DESC;
      `,
      [req.user.id]
    );

    return res.json({ events: result.rows });
  } catch (error) {
    console.error('[Medications] today latest status events error:', error.message);
    return res.status(500).json({ error: 'Failed to load today status events' });
  }
});

router.get('/stock', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          um.id,
          um.medicine_name,
          COALESCE(ms.current_quantity, um.total_quantity) AS total_quantity,
          um.dosage_mg,
          um.daily_amount,
          um.take_with,
          um.intake_timing,
          um.created_at,
          COALESCE(stock_usage.used_pills, 0)::numeric AS used_pills
        FROM user_medications um
        LEFT JOIN medication_stock ms ON ms.medication_id = um.id
        LEFT JOIN (
          SELECT
            mse.medication_id,
            COALESCE(
              SUM(
                CASE
                  WHEN mse.status = 'taken' THEN
                    CASE
                      WHEN COALESCE(mse.quantity_used, 0) > 0 THEN mse.quantity_used
                      ELSE COALESCE(um2.daily_amount, 0)
                    END
                  WHEN mse.status = 'overdose' THEN
                    CASE
                      WHEN COALESCE(mse.quantity_used, 0) > 0 THEN mse.quantity_used
                      ELSE COALESCE(um2.daily_amount, 0) + COALESCE(mse.overdose_tablets, 0)
                    END
                  ELSE 0
                END
              ),
              0
            )::numeric AS used_pills
          FROM medication_status_events mse
          LEFT JOIN user_medications um2 ON um2.id = mse.medication_id
          WHERE mse.user_id = $1
          GROUP BY mse.medication_id
        ) AS stock_usage ON stock_usage.medication_id = um.id
        WHERE um.user_id = $1
        ORDER BY um.created_at DESC;
      `,
      [req.user.id]
    );

    const inventory = result.rows.map((row) => {
      const stock = computeStockSnapshot(row);
      const usedPills = Math.max(0, Number(row.used_pills) || 0);
      const totalPills = stock.pillsLeft + usedPills;

      return {
        id: row.id,
        medicineName: row.medicine_name,
        dosageMg: row.dosage_mg,
        dailyAmount: row.daily_amount,
        takeWith: row.take_with,
        intakeTiming: row.intake_timing,
        totalPills,
        usedPills,
        pillsLeft: stock.pillsLeft,
        daysLeft: stock.daysLeft,
        coveragePercent: stock.coveragePercent,
        isLowStock: stock.isLowStock,
        stockLabel: stock.stockLabel,
        nextRefillDate: stock.refillDate.toISOString(),
      };
    });

    const lowStockCount = inventory.filter((item) => item.isLowStock).length;
    const totalPills = inventory.reduce((sum, item) => sum + (Number(item.totalPills) || 0), 0);
    const usedPills = inventory.reduce((sum, item) => sum + (Number(item.usedPills) || 0), 0);

    return res.json({
      summary: {
        totalMedications: inventory.length,
        lowStockCount,
        totalPills,
        usedPills,
      },
      inventory,
    });
  } catch (error) {
    console.error('[Medications] stock error:', error.message);
    return res.status(500).json({ error: 'Failed to load medicine stock' });
  }
});

router.post('/stock/auto-notify', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, medicine_name, total_quantity, daily_amount
        FROM (
          SELECT um.id, um.medicine_name, COALESCE(ms.current_quantity, um.total_quantity) AS total_quantity, um.daily_amount
          FROM user_medications um
          LEFT JOIN medication_stock ms ON ms.medication_id = um.id
          WHERE um.user_id = $1
        ) AS med_view
        ;
      `,
      [req.user.id]
    );

    let autoNotifiedCount = 0;
    const skipped = [];

    for (const row of result.rows) {
      const stock = computeStockSnapshot(row);
      if (!stock.isLowStock) {
        continue;
      }

      const created = await createLowStockCaregiverAlert({
        userId: req.user.id,
        medication: row,
        daysLeft: stock.daysLeft,
        manual: false,
      });

      if (created.created) {
        autoNotifiedCount += 1;
      } else {
        skipped.push({ medicationId: row.id, reason: created.reason });
      }
    }

    return res.json({ autoNotifiedCount, skipped });
  } catch (error) {
    console.error('[Medications] auto low-stock notify error:', error.message);
    return res.status(500).json({ error: 'Failed to process low stock auto notifications' });
  }
});

router.post('/:id/low-stock-notify', requireAuth, async (req, res) => {
  const medicationId = Number(req.params.id);
  if (!Number.isInteger(medicationId) || medicationId <= 0) {
    return res.status(400).json({ error: 'Valid medication id is required' });
  }

  try {
    const result = await pool.query(
      `
        SELECT id, medicine_name, total_quantity, daily_amount
        FROM (
          SELECT um.id, um.medicine_name, COALESCE(ms.current_quantity, um.total_quantity) AS total_quantity, um.daily_amount
          FROM user_medications um
          LEFT JOIN medication_stock ms ON ms.medication_id = um.id
          WHERE um.id = $1 AND um.user_id = $2
        ) AS med_view
        LIMIT 1;
      `,
      [medicationId, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const medication = result.rows[0];
    const stock = computeStockSnapshot(medication);
    const created = await createLowStockCaregiverAlert({
      userId: req.user.id,
      medication,
      daysLeft: stock.daysLeft,
      manual: true,
    });

    if (!created.created && created.reason === 'no-caregiver') {
      return res.status(400).json({ error: 'No caregiver email found in profile' });
    }

    return res.json({
      notified: created.created,
      reason: created.reason,
      medicationId,
    });
  } catch (error) {
    console.error('[Medications] low-stock notify error:', error.message);
    return res.status(500).json({ error: 'Failed to notify caregiver for low stock' });
  }
});

router.post('/:id/refill', requireAuth, async (req, res) => {
  const medicationId = Number(req.params.id);
  const refillTablets = Number(req.body?.refillTablets);

  if (!Number.isInteger(medicationId) || medicationId <= 0) {
    return res.status(400).json({ error: 'Valid medication id is required' });
  }

  if (!Number.isFinite(refillTablets) || refillTablets <= 0) {
    return res.status(400).json({ error: 'refillTablets must be a positive number' });
  }

  try {
    const medicationResult = await pool.query(
      `
        SELECT id, user_id, total_quantity
        FROM user_medications
        WHERE id = $1 AND user_id = $2
        LIMIT 1;
      `,
      [medicationId, req.user.id]
    );

    if (!medicationResult.rows.length) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const medication = medicationResult.rows[0];
    const fallbackQuantity = Math.max(0, Number(medication.total_quantity) || 0);

    await pool.query(
      `
        INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (medication_id) DO NOTHING;
      `,
      [req.user.id, medicationId, fallbackQuantity]
    );

    const stockResult = await pool.query(
      `
        UPDATE medication_stock
        SET
          current_quantity = current_quantity + $3::numeric,
          initial_quantity = initial_quantity + $3::numeric,
          updated_at = NOW()
        WHERE medication_id = $1 AND user_id = $2
        RETURNING current_quantity, initial_quantity;
      `,
      [medicationId, req.user.id, refillTablets]
    );

    if (!stockResult.rows.length) {
      return res.status(500).json({ error: 'Failed to update stock quantity' });
    }

    await pool.query(
      `
        UPDATE user_medications
        SET
          total_quantity = $3,
          updated_at = NOW()
        WHERE id = $1 AND user_id = $2;
      `,
      [medicationId, req.user.id, stockResult.rows[0].current_quantity]
    );

    return res.json({
      success: true,
      medicationId,
      refillTablets,
      stock: {
        currentQuantity: Number(stockResult.rows[0].current_quantity) || 0,
        initialQuantity: Number(stockResult.rows[0].initial_quantity) || 0,
      },
    });
  } catch (error) {
    console.error('[Medications] refill error:', error.message);
    return res.status(500).json({ error: 'Failed to refill medication stock' });
  }
});

router.post('/:id/refill-notify', requireAuth, async (req, res) => {
  const medicationId = Number(req.params.id);

  if (!Number.isInteger(medicationId) || medicationId <= 0) {
    return res.status(400).json({ error: 'Valid medication id is required' });
  }

  try {
    const medicationResult = await pool.query(
      `
        SELECT id, medicine_name
        FROM user_medications
        WHERE id = $1 AND user_id = $2
        LIMIT 1;
      `,
      [medicationId, req.user.id]
    );

    if (!medicationResult.rows.length) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    const ownerResult = await pool.query(
      `
        SELECT full_name, caregiver_email, caregiver_phone
        FROM users
        WHERE id = $1
        LIMIT 1;
      `,
      [req.user.id]
    );

    const owner = ownerResult.rows[0] || {};
    const caregiverEmail = String(owner?.caregiver_email || '').trim();
    const caregiverPhone = String(owner?.caregiver_phone || '').trim();

    if (!caregiverEmail) {
      return res.status(400).json({ error: 'No caregiver email found in profile' });
    }

    const patientName = String(owner?.full_name || 'Patient').trim();
    const medicineName = String(medicationResult.rows[0]?.medicine_name || 'medicine').trim();

    await pool.query(
      `
        INSERT INTO caregiver_alerts (
          user_id,
          medication_id,
          caregiver_email,
          caregiver_phone,
          title,
          message
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        req.user.id,
        medicationId,
        caregiverEmail,
        caregiverPhone || null,
        'Refill Alert',
        `${patientName} says: I need my ${medicineName} medicine. Please arrange a refill.`,
      ]
    );

    return res.json({ notified: true, medicationId });
  } catch (error) {
    console.error('[Medications] refill notify error:', error.message);
    return res.status(500).json({ error: 'Failed to notify caregiver for refill' });
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
        COALESCE(ms.current_quantity, um.total_quantity) AS total_quantity,
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
      LEFT JOIN medication_stock ms ON ms.medication_id = um.id
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

    await pool.query(
      `
        INSERT INTO medication_stock (user_id, medication_id, initial_quantity, current_quantity)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (medication_id) DO UPDATE
        SET
          user_id = EXCLUDED.user_id,
          initial_quantity = EXCLUDED.initial_quantity,
          current_quantity = EXCLUDED.current_quantity,
          updated_at = NOW();
      `,
      [req.user.id, result.rows[0].id, parsedTotalQuantity]
    );

    return res.json({ medication: { ...result.rows[0], total_quantity: parsedTotalQuantity } });
  } catch (error) {
    console.error('[Medications] update error:', error.message);
    return res.status(500).json({ error: 'Failed to update medication' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const sql = `
      DELETE FROM user_medications
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;

    const result = await pool.query(sql, [req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Medication not found' });
    }

    return res.json({ success: true, deletedId: result.rows[0].id });
  } catch (error) {
    console.error('[Medications] delete error:', error.message);
    return res.status(500).json({ error: 'Failed to delete medication' });
  }
});

router.use(requireDatabase);
router.use(requireAuth);

router.get('/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  return res.json({
    results: searchMedications(query),
  });
});

router.get('/knowledge', (req, res) => {
  const medicineName = String(req.query.medicineName || '').trim();
  const currentMedicationsText = String(req.query.currentMedicationsText || '').trim();
  const symptomMatch = String(req.query.symptomMatch || '').trim();

  if (!medicineName) {
    return res.status(400).json({ error: 'medicineName query parameter is required' });
  }

  return res.json({
    knowledge: enrichMedication({
      medicineName,
      currentMedicationsText,
      symptomMatch,
    }),
  });
});

module.exports = router;
