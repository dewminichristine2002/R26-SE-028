const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'fullName, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await pool.query(
      `
        INSERT INTO users (full_name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, full_name, email, phone, date_of_birth, blood_type, caregiver_email, caregiver_phone
      `,
      [String(fullName).trim(), normalizedEmail, passwordHash]
    );

    const user = inserted.rows[0];
    const secret = process.env.JWT_SECRET || 'eldermeds-dev-secret';
    const token = jwt.sign({ userId: user.id, role: 'user' }, secret);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        role: 'user',
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

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query(
      `
        SELECT id, full_name, email, phone, date_of_birth, blood_type, caregiver_email, caregiver_phone, password_hash
        FROM users
        WHERE email = $1
      `,
      [normalizedEmail]
    );

    let user = result.rows[0] || null;
    let role = 'user';

    if (!user) {
      const caregiverLookup = await pool.query(
        `
          SELECT id, full_name, email, phone, date_of_birth, blood_type, caregiver_email, caregiver_phone
          FROM users
          WHERE caregiver_email = $1
            AND caregiver_phone = $2
        `,
        [normalizedEmail, String(password).trim()]
      );

      if (caregiverLookup.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      user = caregiverLookup.rows[0];
      role = 'caregiver';
    } else {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }
    }

    const secret = process.env.JWT_SECRET || 'eldermeds-dev-secret';
    const token = jwt.sign({ userId: user.id, role }, secret);

    return res.json({
      token,
      user: {
        id: user.id,
        role,
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

module.exports = router;
