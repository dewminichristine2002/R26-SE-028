/**
 * Builds the cards shown on the Unified Conversational Dashboard.
 *
 * These are deterministic SQL aggregations \u2014 NO LLM is involved \u2014 so the cards
 * load fast and predictably. Each card includes a `chatPrompt` that the
 * frontend can hand to the chatbot when the user taps "Ask the assistant".
 */

const { pool } = require('../config/db');

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const tableExists = async (tableName) => {
  try {
    const result = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [tableName]
    );
    return result.rows.length > 0;
  } catch (_) {
    return false;
  }
};

/* ---------- individual cards ---------- */

const adherenceCard = async (userId) => {
  const empty = {
    id: 'medication_adherence',
    title: 'Medication adherence (7d)',
    headline: 'No data yet',
    detail: 'Start logging your medicine intake to see your adherence here.',
    chatPrompt: 'How has my medication adherence been this week?',
  };

  if (!(await tableExists('medication_status_events'))) {
    return empty;
  }

  const result = await pool.query(
    `
      SELECT
        SUM(CASE WHEN status = 'taken'      THEN 1 ELSE 0 END)::int AS taken,
        SUM(CASE WHEN status = 'not-taken'  THEN 1 ELSE 0 END)::int AS missed,
        SUM(CASE WHEN status = 'overdose'   THEN 1 ELSE 0 END)::int AS overdose,
        COUNT(*)::int AS total
      FROM medication_status_events
      WHERE user_id = $1
        AND event_time >= NOW() - INTERVAL '7 days'
    `,
    [userId]
  );

  const row = result.rows[0] || {};
  const taken = safeNumber(row.taken);
  const missed = safeNumber(row.missed);
  const overdose = safeNumber(row.overdose);
  const total = Math.max(0, safeNumber(row.total));

  if (total === 0) {
    return empty;
  }

  const adherencePct = Math.round((taken / total) * 100);

  return {
    id: 'medication_adherence',
    title: 'Medication adherence (7d)',
    headline: `${adherencePct}% adherence`,
    detail: `${taken} taken, ${missed} missed, ${overdose} overdose in the last 7 days.`,
    metric: { taken, missed, overdose, total, adherencePct },
    severity: adherencePct >= 85 ? 'good' : adherencePct >= 60 ? 'warning' : 'critical',
    chatPrompt: 'Why was my adherence lower this week? Show the missed doses and any pattern with my mood.',
  };
};

const missedDosesCard = async (userId) => {
  const empty = {
    id: 'missed_doses',
    title: 'Missed doses (7d)',
    headline: 'No missed doses',
    detail: 'You have logged no missed doses in the last 7 days.',
    severity: 'good',
    chatPrompt: 'Which doses did I miss recently and at what time of day?',
  };

  if (!(await tableExists('medication_status_events'))) {
    return empty;
  }

  const result = await pool.query(
    `
      SELECT
        mse.event_time,
        mse.schedule_slot,
        um.medicine_name
      FROM medication_status_events mse
      LEFT JOIN user_medications um ON um.id = mse.medication_id
      WHERE mse.user_id = $1
        AND mse.status = 'not-taken'
        AND mse.event_time >= NOW() - INTERVAL '7 days'
      ORDER BY mse.event_time DESC
      LIMIT 10
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return empty;
  }

  return {
    id: 'missed_doses',
    title: 'Missed doses (7d)',
    headline: `${result.rows.length} missed dose${result.rows.length === 1 ? '' : 's'}`,
    detail: result.rows
      .slice(0, 3)
      .map((row) => `${row.medicine_name || 'Medicine'} \u2014 ${row.schedule_slot || 'dose'}`)
      .join(', '),
    items: result.rows,
    severity: result.rows.length >= 3 ? 'critical' : 'warning',
    chatPrompt: 'Tell me which medicines I missed in the last 7 days and at what times.',
  };
};

const emotionalTrendCard = async (userId) => {
  const empty = {
    id: 'emotional_trend',
    title: 'Mood trend (7d)',
    headline: 'No mood check-ins yet',
    detail: 'Open Emotions to do a quick check-in.',
    chatPrompt: 'How has my mood been recently?',
  };

  if (!(await tableExists('emotional_support_emotion_sessions'))) {
    return empty;
  }

  const result = await pool.query(
    `
      WITH recent AS (
        SELECT detected_emotion, stress_score, loneliness_score, risk_level
        FROM emotional_support_emotion_sessions
        WHERE elder_user_id = $1
          AND created_at >= NOW() - INTERVAL '7 days'
      ),
      counts AS (
        SELECT detected_emotion, COUNT(*) AS total
        FROM recent
        GROUP BY detected_emotion
        ORDER BY total DESC, detected_emotion ASC
        LIMIT 1
      )
      SELECT
        (SELECT COUNT(*) FROM recent)::int AS total,
        (SELECT detected_emotion FROM counts) AS dominant_emotion,
        COALESCE((SELECT AVG(stress_score) FROM recent), 0)::float AS avg_stress,
        COALESCE((SELECT AVG(loneliness_score) FROM recent), 0)::float AS avg_loneliness,
        (SELECT COUNT(*) FROM recent WHERE risk_level = 'high')::int AS high_risk_count
    `,
    [userId]
  );

  const row = result.rows[0] || {};
  if (!row.total || row.total === 0) {
    return empty;
  }

  const dominant = row.dominant_emotion || 'neutral';
  const avgStress = safeNumber(row.avg_stress);
  const highRisk = safeNumber(row.high_risk_count);

  return {
    id: 'emotional_trend',
    title: 'Mood trend (7d)',
    headline: `Mostly ${dominant}`,
    detail: `${row.total} check-in${row.total === 1 ? '' : 's'} \u00b7 avg stress ${(avgStress * 100).toFixed(0)}%${highRisk > 0 ? ` \u00b7 ${highRisk} high-risk` : ''}.`,
    metric: { dominant, avgStress, highRisk, total: row.total },
    severity: highRisk > 0 || avgStress > 0.7 ? 'warning' : 'good',
    chatPrompt: 'Summarise how my mood and stress have changed in the last week.',
  };
};

const caregiverAlertsCard = async (userId) => {
  const empty = {
    id: 'caregiver_alerts',
    title: 'Caregiver alerts',
    headline: 'No open alerts',
    detail: 'Nothing needs attention right now.',
    severity: 'good',
    chatPrompt: 'Show me my recent caregiver alerts.',
  };

  let medAlerts = 0;
  let moodAlerts = 0;

  if (await tableExists('caregiver_alerts')) {
    const r1 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM caregiver_alerts WHERE user_id = $1 AND COALESCE(is_read, FALSE) = FALSE`,
      [userId]
    );
    medAlerts = safeNumber(r1.rows[0]?.c);
  }

  if (await tableExists('emotional_support_caregiver_alerts')) {
    const r2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM emotional_support_caregiver_alerts WHERE elder_user_id = $1 AND status = 'open'`,
      [userId]
    );
    moodAlerts = safeNumber(r2.rows[0]?.c);
  }

  const total = medAlerts + moodAlerts;
  if (total === 0) {
    return empty;
  }

  return {
    id: 'caregiver_alerts',
    title: 'Caregiver alerts',
    headline: `${total} open alert${total === 1 ? '' : 's'}`,
    detail: `${medAlerts} medication, ${moodAlerts} mood`,
    metric: { medication: medAlerts, mood: moodAlerts, total },
    severity: total >= 3 ? 'critical' : 'warning',
    chatPrompt: 'Show me my open caregiver alerts and explain each one.',
  };
};

const lowStockCard = async (userId) => {
  const empty = {
    id: 'low_stock',
    title: 'Medicine stock',
    headline: 'Stock OK',
    detail: 'No medicines are running low.',
    severity: 'good',
    chatPrompt: 'Which medicines are running low and when should I refill?',
  };

  if (!(await tableExists('user_medications'))) {
    return empty;
  }

  const stockJoin = (await tableExists('medication_stock'))
    ? 'LEFT JOIN medication_stock ms ON ms.medication_id = um.id'
    : '';
  const stockExpr = (await tableExists('medication_stock'))
    ? 'COALESCE(ms.current_quantity, um.total_quantity)'
    : 'um.total_quantity';

  const result = await pool.query(
    `
      SELECT
        um.id,
        um.medicine_name,
        ${stockExpr}::float AS pills_left,
        um.daily_amount::float AS daily_amount
      FROM user_medications um
      ${stockJoin}
      WHERE um.user_id = $1
    `,
    [userId]
  );

  const lowStock = result.rows
    .map((row) => {
      const daily = Math.max(1, safeNumber(row.daily_amount, 1));
      const pills = Math.max(0, safeNumber(row.pills_left));
      const days = pills / daily;
      return { name: row.medicine_name, daysLeft: days, pillsLeft: pills };
    })
    .filter((row) => row.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (lowStock.length === 0) {
    return empty;
  }

  return {
    id: 'low_stock',
    title: 'Medicine stock',
    headline: `${lowStock.length} medicine${lowStock.length === 1 ? '' : 's'} low`,
    detail: lowStock
      .slice(0, 3)
      .map((m) => `${m.name} (${Math.ceil(m.daysLeft)}d)`)
      .join(', '),
    items: lowStock,
    severity: lowStock.some((m) => m.daysLeft <= 3) ? 'critical' : 'warning',
    chatPrompt: 'Which medicines are running low and how many days do I have left?',
  };
};

const allergyRiskCard = async (userId) => {
  const empty = {
    id: 'allergy_risk',
    title: 'Medicine safety',
    headline: 'No risky medicines',
    detail: 'Recent safety checks show no high-risk medicines.',
    severity: 'good',
    chatPrompt: 'Are any of my recent medicine safety checks dangerous?',
  };

  if (!(await tableExists('allergy_cards'))) {
    return empty;
  }

  const result = await pool.query(
    `
      SELECT medicine_name, risk_level, risk_score
      FROM allergy_cards
      WHERE user_id = $1
        AND risk_level IN ('Warning', 'Dangerous')
      ORDER BY
        CASE risk_level WHEN 'Dangerous' THEN 1 WHEN 'Warning' THEN 2 ELSE 3 END,
        COALESCE(risk_score, 0) DESC,
        updated_at DESC
      LIMIT 5
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return empty;
  }

  const dangerous = result.rows.filter((r) => r.risk_level === 'Dangerous').length;

  return {
    id: 'allergy_risk',
    title: 'Medicine safety',
    headline: dangerous > 0 ? `${dangerous} dangerous` : `${result.rows.length} warning${result.rows.length === 1 ? '' : 's'}`,
    detail: result.rows.slice(0, 3).map((r) => `${r.medicine_name} (${r.risk_level})`).join(', '),
    items: result.rows,
    severity: dangerous > 0 ? 'critical' : 'warning',
    chatPrompt: 'Which of my saved medicines were flagged as dangerous and why?',
  };
};

const routineCard = async (userId) => {
  const fallback = {
    id: 'routine',
    title: 'Daily routine',
    headline: 'Routine not set',
    detail: 'Set your meal and sleep times to anchor reminders.',
    severity: 'warning',
    chatPrompt: 'What is my daily routine and which medicines line up with each meal?',
  };

  if (!(await tableExists('user_routines'))) {
    return fallback;
  }

  const result = await pool.query(
    `SELECT breakfast_time, lunch_time, dinner_time, sleep_time FROM user_routines WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (!result.rows[0]) {
    return fallback;
  }

  const r = result.rows[0];
  return {
    id: 'routine',
    title: 'Daily routine',
    headline: `Breakfast ${r.breakfast_time}`,
    detail: `Lunch ${r.lunch_time} \u00b7 Dinner ${r.dinner_time} \u00b7 Sleep ${r.sleep_time}`,
    severity: 'good',
    chatPrompt: 'Which medicines line up with each meal in my routine?',
  };
};

/* ---------- public ---------- */

const buildSummary = async (userId) => {
  const cards = await Promise.all([
    adherenceCard(userId).catch(() => null),
    missedDosesCard(userId).catch(() => null),
    emotionalTrendCard(userId).catch(() => null),
    caregiverAlertsCard(userId).catch(() => null),
    lowStockCard(userId).catch(() => null),
    allergyRiskCard(userId).catch(() => null),
    routineCard(userId).catch(() => null),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    cards: cards.filter(Boolean),
  };
};

module.exports = {
  buildSummary,
};
