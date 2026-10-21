const { pool } = require('../config/db');

const normalizeRecord = (record) => ({
  id: record.id,
  mealTimes: {
    breakfast: record.breakfast_time,
    lunch: record.lunch_time,
    dinner: record.dinner_time,
    sleep: record.sleep_time,
  },
  updatedAt: record.updated_at,
});

const getRoutine = async (userId) => {
  if (!userId) {
    throw new Error('User ID is required to fetch routine');
  }

  const result = await pool.query(
    `
      SELECT *
      FROM user_routines
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (!result.rows.length) {
    const inserted = await pool.query(
      `
        INSERT INTO user_routines (user_id)
        VALUES ($1)
        RETURNING *
      `,
      [userId]
    );

    return normalizeRecord(inserted.rows[0]);
  }

  return normalizeRecord(result.rows[0]);
};

const saveRoutine = async (userId, mealTimes) => {
  if (!userId) {
    throw new Error('User ID is required to save routine');
  }

  const result = await pool.query(
    `
      INSERT INTO user_routines (user_id, breakfast_time, lunch_time, dinner_time, sleep_time, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        breakfast_time = EXCLUDED.breakfast_time,
        lunch_time = EXCLUDED.lunch_time,
        dinner_time = EXCLUDED.dinner_time,
        sleep_time = EXCLUDED.sleep_time,
        updated_at = NOW()
      RETURNING *
    `,
    [userId, mealTimes.breakfast, mealTimes.lunch, mealTimes.dinner, mealTimes.sleep]
  );

  return normalizeRecord(result.rows[0]);
};

module.exports = {
  getRoutine,
  saveRoutine,
};
