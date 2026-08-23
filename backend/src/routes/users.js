const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, full_name, email, phone, date_of_birth, blood_type, caregiver_email, caregiver_phone
        FROM users
        WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    return res.json({
      user: {
        id: user.id,
        role: req.user.role || 'user',
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        dateOfBirth: user.date_of_birth,
        bloodType: user.blood_type || '',
        caregiverEmail: user.caregiver_email || '',
        caregiverPhone: user.caregiver_phone || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { fullName, phone, dateOfBirth, bloodType, caregiverEmail, caregiverPhone } = req.body;

    const normalizedCaregiverEmail = caregiverEmail ? String(caregiverEmail).trim().toLowerCase() : null;
    const normalizedCaregiverPhone = caregiverPhone ? String(caregiverPhone).trim() : null;

    if (normalizedCaregiverEmail) {
      const ownerEmailResult = await pool.query(
        `
          SELECT email
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [req.user.id]
      );

      const ownerEmail = ownerEmailResult.rows[0]?.email ? String(ownerEmailResult.rows[0].email).trim().toLowerCase() : '';
      if (ownerEmail && ownerEmail === normalizedCaregiverEmail) {
        return res.status(400).json({ error: 'Caregiver email must be different from your own email' });
      }

      const existing = await pool.query(
        `
          SELECT id
          FROM users
          WHERE caregiver_email = $1
            AND id <> $2
          LIMIT 1
        `,
        [normalizedCaregiverEmail, req.user.id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Caregiver email is already linked to another user' });
      }
    }

    const updated = await pool.query(
      `
        UPDATE users
        SET
          full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          date_of_birth = COALESCE($3, date_of_birth),
          blood_type = COALESCE($4, blood_type),
          caregiver_email = COALESCE($5, caregiver_email),
          caregiver_phone = COALESCE($6, caregiver_phone),
          updated_at = NOW()
        WHERE id = $7
        RETURNING id, full_name, email, phone, date_of_birth, blood_type, caregiver_email, caregiver_phone
      `,
      [
        fullName ? String(fullName).trim() : null,
        phone ? String(phone).trim() : null,
        dateOfBirth || null,
        bloodType ? String(bloodType).trim() : null,
        normalizedCaregiverEmail,
        normalizedCaregiverPhone,
        req.user.id,
      ]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = updated.rows[0];
    return res.json({
      user: {
        id: user.id,
        role: req.user.role || 'user',
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        dateOfBirth: user.date_of_birth,
        bloodType: user.blood_type || '',
        caregiverEmail: user.caregiver_email || '',
        caregiverPhone: user.caregiver_phone || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/caregiver-alerts', requireAuth, async (req, res) => {
  if ((req.user.role || 'user') !== 'caregiver') {
    return res.status(403).json({ error: 'Caregiver access required' });
  }

  try {
    const result = await pool.query(
      `
        SELECT *
        FROM (
          SELECT
            id::text AS id,
            'medication' AS source,
            user_id,
            status_event_id,
            medication_id,
            caregiver_email,
            caregiver_phone,
            CASE
              WHEN LOWER(COALESCE(message, '')) LIKE '%please arrange a refill%'
                OR LOWER(COALESCE(message, '')) LIKE '%requested refill%'
                OR LOWER(COALESCE(message, '')) LIKE '%need my%' THEN 'Refill Alert'
              ELSE title
            END AS title,
            message,
            is_read,
            created_at,
            read_at,
            NULL::text AS alert_type,
            NULL::text AS severity,
            NULL::text AS status
          FROM caregiver_alerts
          WHERE user_id = $1

          UNION ALL

          SELECT
            'emotional:' || id::text AS id,
            'emotional_support' AS source,
            elder_user_id AS user_id,
            NULL::integer AS status_event_id,
            NULL::integer AS medication_id,
            NULL::text AS caregiver_email,
            NULL::text AS caregiver_phone,
            title,
            message,
            status <> 'open' AS is_read,
            created_at,
            COALESCE(acknowledged_at, resolved_at) AS read_at,
            alert_type,
            severity,
            status
          FROM emotional_support_caregiver_alerts
          WHERE caregiver_user_id = $1
             OR elder_user_id = $1
        ) combined_alerts
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [req.user.id]
    );

    const unreadCount = result.rows.filter((row) => !row.is_read).length;
    return res.json({ alerts: result.rows, unreadCount });
  } catch (error) {
    console.error('[Users] caregiver alerts list error:', error.message);
    return res.status(500).json({ error: 'Failed to load caregiver alerts' });
  }
});

router.patch('/caregiver-alerts/:id/read', requireAuth, async (req, res) => {
  if ((req.user.role || 'user') !== 'caregiver') {
    return res.status(403).json({ error: 'Caregiver access required' });
  }

  const rawAlertId = String(req.params.id || '').trim();
  if (!rawAlertId) {
    return res.status(400).json({ error: 'Valid alert id is required' });
  }

  try {
    if (rawAlertId.startsWith('emotional:')) {
      const emotionalAlertId = rawAlertId.replace(/^emotional:/, '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(emotionalAlertId)) {
        return res.status(400).json({ error: 'Valid alert id is required' });
      }
      const updated = await pool.query(
        `
          UPDATE emotional_support_caregiver_alerts
          SET
            status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
            acknowledged_at = COALESCE(acknowledged_at, NOW())
          WHERE id = $1::uuid
            AND (caregiver_user_id = $2 OR elder_user_id = $2)
          RETURNING
            'emotional:' || id::text AS id,
            'emotional_support' AS source,
            elder_user_id AS user_id,
            NULL::integer AS status_event_id,
            NULL::integer AS medication_id,
            NULL::text AS caregiver_email,
            NULL::text AS caregiver_phone,
            title,
            message,
            status <> 'open' AS is_read,
            created_at,
            COALESCE(acknowledged_at, resolved_at) AS read_at,
            alert_type,
            severity,
            status
        `,
        [emotionalAlertId, req.user.id]
      );

      if (updated.rows.length === 0) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      return res.json({ alert: updated.rows[0] });
    }

    const alertId = Number(rawAlertId);
    if (!Number.isInteger(alertId) || alertId <= 0) {
      return res.status(400).json({ error: 'Valid alert id is required' });
    }

    const updated = await pool.query(
      `
        UPDATE caregiver_alerts
        SET
          is_read = TRUE,
          read_at = COALESCE(read_at, NOW())
        WHERE id = $1
          AND user_id = $2
        RETURNING
          id,
          user_id,
          status_event_id,
          medication_id,
          caregiver_email,
          caregiver_phone,
          CASE
            WHEN LOWER(COALESCE(message, '')) LIKE '%please arrange a refill%'
              OR LOWER(COALESCE(message, '')) LIKE '%requested refill%'
              OR LOWER(COALESCE(message, '')) LIKE '%need my%' THEN 'Refill Alert'
            ELSE title
          END AS title,
          message,
          is_read,
          created_at,
          read_at
      `,
      [alertId, req.user.id]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    return res.json({ alert: updated.rows[0] });
  } catch (error) {
    console.error('[Users] caregiver alert update error:', error.message);
    return res.status(500).json({ error: 'Failed to update caregiver alert' });
  }
});

router.get('/caregiver-timeline', requireAuth, async (req, res) => {
  if ((req.user.role || 'user') !== 'caregiver') {
    return res.status(403).json({ error: 'Caregiver access required' });
  }

  try {
    const result = await pool.query(
      `
        SELECT
          mse.id,
          mse.medication_id,
          mse.status,
          mse.overdose_tablets,
          mse.event_time,
          mse.created_at,
          um.medicine_name,
          um.dosage_mg
        FROM medication_status_events mse
        LEFT JOIN user_medications um ON um.id = mse.medication_id
        WHERE mse.user_id = $1
        ORDER BY mse.event_time DESC
        LIMIT 20
      `,
      [req.user.id]
    );

    return res.json({ timeline: result.rows });
  } catch (error) {
    console.error('[Users] caregiver timeline error:', error.message);
    return res.status(500).json({ error: 'Failed to load caregiver timeline' });
  }
});

module.exports = router;
