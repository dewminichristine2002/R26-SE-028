const { query } = require('../db/postgres');

async function createAlertsForCaregivers({ elderId, caregiverIds, sessionId, alertPayload, explanation }) {
  if (!Array.isArray(caregiverIds) || caregiverIds.length === 0 || !alertPayload) {
    return [];
  }

  const created = [];

  for (const caregiverId of caregiverIds) {
    const result = await query(
      `
        INSERT INTO emotional_support_caregiver_alerts (
          elder_user_id,
          caregiver_user_id,
          session_id,
          alert_type,
          severity,
          title,
          message,
          explanation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        RETURNING
          id AS "alertId",
          caregiver_user_id AS "caregiverId",
          alert_type AS "alertType",
          severity,
          title,
          message,
          status,
          created_at AS "createdAt"
      `,
      [
        elderId,
        caregiverId,
        sessionId,
        alertPayload.alertType,
        alertPayload.severity,
        alertPayload.title,
        alertPayload.message,
        JSON.stringify(explanation || {}),
      ]
    );

    created.push(result.rows[0]);
  }

  return created;
}

async function getCaregiverAlerts(caregiverId, status = 'open') {
  const params = [caregiverId];
  let statusFilter = '';

  if (status && status !== 'all') {
    params.push(status);
    statusFilter = 'AND status = $2';
  }

  const result = await query(
    `
      SELECT
        id AS "alertId",
        elder_user_id AS "elderId",
        caregiver_user_id AS "caregiverId",
        alert_type AS "alertType",
        severity,
        title,
        message,
        explanation,
        status,
        created_at AS "createdAt",
        acknowledged_at AS "acknowledgedAt",
        resolved_at AS "resolvedAt"
      FROM emotional_support_caregiver_alerts
      WHERE caregiver_user_id = $1
      ${statusFilter}
      ORDER BY created_at DESC
    `,
    params
  );

  return result.rows;
}

async function acknowledgeAlert(alertId, caregiverId) {
  const result = await query(
    `
      UPDATE emotional_support_caregiver_alerts
      SET
        status = 'acknowledged',
        acknowledged_at = NOW()
      WHERE id = $1
        AND caregiver_user_id = $2
      RETURNING
        id AS "alertId",
        caregiver_user_id AS "caregiverId",
        status,
        acknowledged_at AS "acknowledgedAt"
    `,
    [alertId, caregiverId]
  );

  return result.rows[0] || null;
}

module.exports = {
  acknowledgeAlert,
  createAlertsForCaregivers,
  getCaregiverAlerts,
};
