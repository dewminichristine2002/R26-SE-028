const express = require('express');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, full_name, email, phone, date_of_birth, blood_type
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
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        dateOfBirth: user.date_of_birth,
        bloodType: user.blood_type || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { fullName, phone, dateOfBirth, bloodType } = req.body;

    const updated = await pool.query(
      `
        UPDATE users
        SET
          full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone),
          date_of_birth = COALESCE($3, date_of_birth),
          blood_type = COALESCE($4, blood_type),
          updated_at = NOW()
        WHERE id = $5
        RETURNING id, full_name, email, phone, date_of_birth, blood_type
      `,
      [
        fullName ? String(fullName).trim() : null,
        phone ? String(phone).trim() : null,
        dateOfBirth || null,
        bloodType ? String(bloodType).trim() : null,
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
        fullName: user.full_name,
        email: user.email,
        phone: user.phone || '',
        dateOfBirth: user.date_of_birth,
        bloodType: user.blood_type || '',
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
