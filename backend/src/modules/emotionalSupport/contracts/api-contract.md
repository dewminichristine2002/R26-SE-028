# Emotional Support API Contract

Base path: `/api/emotional-support`

## `POST /check-ins`

Create an elder emotional check-in and return the detected emotion, recommended intervention, and suggested cognitive activity.

Request body:

```json
{
  "elderId": "uuid",
  "checkInType": "manual",
  "inputMode": "multimodal",
  "emoji": "sad",
  "text": "I feel tired and alone today",
  "transcript": null
}
```

Response:

```json
{
  "sessionId": "uuid",
  "detectedEmotion": "lonely",
  "confidence": 0.84,
  "scores": {
    "sentimentScore": -0.62,
    "stressScore": 0.41,
    "lonelinessScore": 0.81
  },
  "riskLevel": "medium",
  "intervention": {
    "responseType": "empathetic_reply",
    "responseText": "It sounds like today feels heavy. Let us take one small step together."
  },
  "activity": {
    "title": "Memory Reflection",
    "type": "reflection",
    "prompt": "Share one pleasant memory from this week."
  }
}
```

## `GET /elders/:elderId/history?limit=20`

Return recent emotion sessions for the elder.

## `GET /elders/:elderId/trends/summary`

Return a condensed 7-day or 30-day emotional trend summary for dashboards.

## `GET /elders/:elderId/activities/next?emotion=sad`

Return the best next cognitive activity for the elder based on the current emotional state.

## `POST /activities/:activityId/attempts`

Save an activity attempt result.

## `GET /caregivers/:caregiverId/elders`

Return all elders assigned to the caregiver with current risk and latest mood summary.

## `GET /caregivers/:caregiverId/alerts?status=open`

Return caregiver alerts filtered by status.

## `PATCH /alerts/:alertId/acknowledge`

Mark a caregiver alert as acknowledged.

## `GET /caregivers/:caregiverId/elders/:elderId`

Return a caregiver-facing elder profile containing emotional summary, recent sessions, and alert state.
