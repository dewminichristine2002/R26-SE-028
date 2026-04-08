const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { requireDatabase } = require('../middleware/databaseMiddleware');

const router = express.Router();

router.use(requireDatabase);

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
        RETURNING id, full_name, email, phone, date_of_birth, blood_type
      `,
      [String(fullName).trim(), normalizedEmail, passwordHash]
    );

    const user = inserted.rows[0];
    const secret = process.env.JWT_SECRET || 'eldermeds-dev-secret';
    const token = jwt.sign({ userId: user.id }, secret);

    return res.status(201).json({
      token,
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

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query(
      `
        SELECT id, full_name, email, phone, date_of_birth, blood_type, password_hash
        FROM users
        WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const secret = process.env.JWT_SECRET || 'eldermeds-dev-secret';
    const token = jwt.sign({ userId: user.id }, secret);

    return res.json({
      token,
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
