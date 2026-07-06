require('dotenv').config();

const { getPool, withTransaction } = require('../db/postgres');

const DEMO_CAREGIVER_ID = 2;

const elders = [
  {
    id: 1,
    name: 'Nimal Perera',
    age: 72,
    gender: 'male',
    livingStatus: 'alone',
    baselineMood: 'neutral',
    cognitiveLevel: 'medium',
    chronicConditions: ['hypertension'],
  },
  {
    id: 3,
    name: 'Kamala Silva',
    age: 76,
    gender: 'female',
    livingStatus: 'family',
    baselineMood: 'lonely',
    cognitiveLevel: 'medium',
    chronicConditions: ['diabetes'],
  },
  {
    id: 4,
    name: 'Sunil Fernando',
    age: 81,
    gender: 'male',
    livingStatus: 'care_home',
    baselineMood: 'confused',
    cognitiveLevel: 'low',
    chronicConditions: ['arthritis'],
  },
];

const responseTemplates = {
  happy: {
    type: 'motivation',
    text: 'It is good to hear some positive energy today. Let us build on that feeling.',
    followUp: 'Would you like a short gratitude reflection?',
  },
  sad: {
    type: 'empathetic_reply',
    text: 'It sounds like today feels difficult. We can slow down and focus on one gentle step together.',
    followUp: 'Would you like to reflect on one comforting memory?',
  },
  angry: {
    type: 'de_escalation',
    text: 'I can sense strong frustration right now. Let us pause and choose one steady memory before doing anything else.',
    followUp: 'Would you like to think of a time when someone helped you feel respected or understood?',
  },
  anxious: {
    type: 'calming_support',
    text: 'It sounds like you may be feeling worried. Let us slow the moment down and focus on one simple, familiar memory.',
    followUp: 'Would you like to remember a place where you have felt calm before?',
  },
  lonely: {
    type: 'empathetic_reply',
    text: 'Feeling alone can be heavy. You are being heard right now, and we can take one supportive step together.',
    followUp: 'Is there someone you would like to reach out to today?',
  },
  confused: {
    type: 'empathetic_reply',
    text: 'Feeling unsure can be unsettling. We can take this one step at a time and use a familiar memory to help you feel oriented.',
    followUp: 'Would you like to recall one familiar person, place, or routine?',
  },
  neutral: {
    type: 'empathetic_reply',
    text: 'Thank you for telling me. A quiet or ordinary day is still worth checking in about. Let us do one simple activity together.',
    followUp: 'Would you like to do a quick orientation check?',
  },
};

const activityTemplates = {
  happy: {
    title: 'Happy Memory Reflection',
    type: 'memory',
    prompt: 'Share one happy memory from today or this week.',
  },
  sad: {
    title: 'Comforting Memory',
    type: 'memory',
    prompt: 'Share one pleasant memory with a person, place, or song that comforted you.',
  },
  angry: {
    title: 'Respectful Moment Memory',
    type: 'memory',
    prompt: 'Recall a time when someone listened to you well. What helped you feel respected?',
  },
  anxious: {
    title: 'Calm Place Memory',
    type: 'memory',
    prompt: 'Think of a place where you felt calm. What did you see or hear there?',
  },
  lonely: {
    title: 'Comforting Memory',
    type: 'memory',
    prompt: 'Share one pleasant memory with a person, place, or song that comforted you.',
  },
  confused: {
    title: 'Familiar Routine Memory',
    type: 'memory',
    prompt: 'Name one familiar daily routine and describe the first step you usually do.',
  },
  neutral: {
    title: 'Familiar Routine Memory',
    type: 'memory',
    prompt: 'Name one familiar daily routine and describe the first step you usually do.',
  },
};

const demoSessions = [
  {
    elderId: elders[0].id,
    daysAgo: 0,
    emotion: 'happy',
    risk: 'low',
    input: 'I feel good after taking a walk this morning.',
    sentiment: 0.72,
    stress: 0.12,
    loneliness: 0.08,
    confidence: 0.88,
    score: 9,
  },
  {
    elderId: elders[0].id,
    daysAgo: 1,
    emotion: 'neutral',
    risk: 'low',
    input: 'Today is normal. I finished breakfast and rested.',
    sentiment: 0.1,
    stress: 0.2,
    loneliness: 0.12,
    confidence: 0.71,
    score: 8,
  },
  {
    elderId: elders[0].id,
    daysAgo: 3,
    emotion: 'anxious',
    risk: 'medium',
    input: 'I am worried that I may forget my tablets tonight.',
    sentiment: -0.42,
    stress: 0.74,
    loneliness: 0.2,
    confidence: 0.83,
    score: 7,
  },
  {
    elderId: elders[0].id,
    daysAgo: 6,
    emotion: 'sad',
    risk: 'medium',
    input: 'I feel down because my knees hurt today.',
    sentiment: -0.61,
    stress: 0.44,
    loneliness: 0.28,
    confidence: 0.82,
    score: 6,
  },
  {
    elderId: elders[1].id,
    daysAgo: 0,
    emotion: 'lonely',
    risk: 'high',
    input: 'I feel alone today and I miss talking to my daughter.',
    sentiment: -0.66,
    stress: 0.58,
    loneliness: 0.9,
    confidence: 0.9,
    score: 5,
    alert: 'loneliness_pattern',
  },
  {
    elderId: elders[1].id,
    daysAgo: 2,
    emotion: 'lonely',
    risk: 'high',
    input: 'The house feels empty and nobody visited.',
    sentiment: -0.62,
    stress: 0.52,
    loneliness: 0.86,
    confidence: 0.86,
    score: 5,
  },
  {
    elderId: elders[1].id,
    daysAgo: 4,
    emotion: 'sad',
    risk: 'medium',
    input: 'I felt sad in the evening.',
    sentiment: -0.58,
    stress: 0.38,
    loneliness: 0.55,
    confidence: 0.78,
    score: 6,
  },
  {
    elderId: elders[1].id,
    daysAgo: 8,
    emotion: 'happy',
    risk: 'low',
    input: 'My neighbor called me and I felt happy.',
    sentiment: 0.68,
    stress: 0.14,
    loneliness: 0.18,
    confidence: 0.82,
    score: 9,
  },
  {
    elderId: elders[2].id,
    daysAgo: 0,
    emotion: 'confused',
    risk: 'medium',
    input: 'I am confused about whether I already had lunch.',
    sentiment: -0.35,
    stress: 0.66,
    loneliness: 0.22,
    confidence: 0.81,
    score: 6,
  },
  {
    elderId: elders[2].id,
    daysAgo: 1,
    emotion: 'angry',
    risk: 'medium',
    input: 'I felt angry when I could not find my glasses.',
    sentiment: -0.64,
    stress: 0.78,
    loneliness: 0.18,
    confidence: 0.84,
    score: 6,
    alert: 'high_stress',
  },
  {
    elderId: elders[2].id,
    daysAgo: 5,
    emotion: 'confused',
    risk: 'medium',
    input: 'I forgot what day it was for a moment.',
    sentiment: -0.32,
    stress: 0.62,
    loneliness: 0.18,
    confidence: 0.77,
    score: 7,
  },
  {
    elderId: elders[2].id,
    daysAgo: 9,
    emotion: 'neutral',
    risk: 'low',
    input: 'I watched television after tea.',
    sentiment: 0.08,
    stress: 0.18,
    loneliness: 0.12,
    confidence: 0.69,
    score: 8,
  },
];

function createdAt(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(9 + (daysAgo % 8), 15, 0, 0);
  return date;
}

function emotionProbabilities(primaryEmotion) {
  const scores = {
    happy: 0.03,
    sad: 0.03,
    angry: 0.03,
    anxious: 0.03,
    lonely: 0.03,
    confused: 0.03,
    neutral: 0.05,
  };
  scores[primaryEmotion] = 0.82;
  return scores;
}

async function ensureResponseTemplate(client, emotion) {
  const template = responseTemplates[emotion];
  const existing = await client.query(
    `
      SELECT id
      FROM emotional_support_response_bank
      WHERE emotion_category = $1
        AND response_text = $2
      LIMIT 1
    `,
    [emotion, template.text]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      INSERT INTO emotional_support_response_bank (
        emotion_category,
        response_type,
        target_risk_level,
        response_text,
        follow_up_prompt
      )
      VALUES ($1, $2, NULL, $3, $4)
      RETURNING id
    `,
    [emotion, template.type, template.text, template.followUp]
  );

  return result.rows[0]?.id || null;
}

async function ensureActivity(client, emotion) {
  const activity = activityTemplates[emotion];
  const existing = await client.query(
    `
      SELECT id
      FROM emotional_support_cognitive_activities
      WHERE title = $1
      LIMIT 1
    `,
    [activity.title]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      INSERT INTO emotional_support_cognitive_activities (
        title,
        activity_type,
        difficulty,
        target_emotions,
        prompt,
        expected_answer_type,
        options,
        estimated_duration_sec
      )
      VALUES ($1, $2, 'easy', ARRAY[$3]::TEXT[], $4, 'text', '[]'::JSONB, 90)
      RETURNING id
    `,
    [activity.title, activity.type, emotion, activity.prompt]
  );

  return result.rows[0]?.id || null;
}

async function seed() {
  return withTransaction(async (client) => {
    const elderIds = elders.map((elder) => elder.id);

    await client.query(
      `
        DELETE FROM emotional_support_caregiver_alerts
        WHERE elder_user_id = ANY($1::INTEGER[])
           OR caregiver_user_id = $2
      `,
      [elderIds, DEMO_CAREGIVER_ID]
    );
    await client.query('DELETE FROM emotional_support_emotion_sessions WHERE elder_user_id = ANY($1::INTEGER[])', [elderIds]);
    await client.query('DELETE FROM emotional_support_elder_profiles WHERE elder_user_id = ANY($1::INTEGER[])', [elderIds]);

    for (const elder of elders) {
      await client.query(
        `
          INSERT INTO emotional_support_elder_profiles (
            elder_user_id,
            display_name,
            age,
            gender,
            living_status,
            baseline_mood,
            cognitive_level,
            check_in_times,
            voice_enabled,
            chronic_conditions,
            clinical_notes,
            caregiver_user_ids,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            ARRAY['09:00', '18:00'],
            FALSE,
            $8::TEXT[],
            'Demo profile for caregiver dashboard and emotional-support reporting.',
            ARRAY[$9]::INTEGER[],
            NOW()
          )
        `,
        [
          elder.id,
          elder.name,
          elder.age,
          elder.gender,
          elder.livingStatus,
          elder.baselineMood,
          elder.cognitiveLevel,
          elder.chronicConditions,
          DEMO_CAREGIVER_ID,
        ]
      );
    }

    const activityIds = {};
    const responseBankIds = {};
    for (const emotion of Object.keys(responseTemplates)) {
      responseBankIds[emotion] = await ensureResponseTemplate(client, emotion);
      activityIds[emotion] = await ensureActivity(client, emotion);
    }

    for (const session of demoSessions) {
      const time = createdAt(session.daysAgo);
      const template = responseTemplates[session.emotion];
      const activity = activityTemplates[session.emotion];
      const profile = elders.find((elder) => elder.id === session.elderId);

      const sessionResult = await client.query(
        `
          INSERT INTO emotional_support_emotion_sessions (
            elder_user_id,
            input_mode,
            check_in_type,
            emoji,
            raw_text,
            sentiment_score,
            stress_score,
            loneliness_score,
            confidence_score,
            detected_emotion,
            emotion_probabilities,
            context_snapshot,
            activity_id,
            risk_level,
            created_at,
            updated_at
          )
          VALUES (
            $1, 'text', 'manual', $2, $3, $4, $5, $6, $7, $8,
            $9::JSONB,
            $10::JSONB,
            $11,
            $12,
            $13,
            $13
          )
          RETURNING id
        `,
        [
          session.elderId,
          session.emotion,
          session.input,
          session.sentiment,
          session.stress,
          session.loneliness,
          session.confidence,
          session.emotion,
          JSON.stringify(emotionProbabilities(session.emotion)),
          JSON.stringify({
            demoSeed: true,
            elderName: profile.name,
            medicationAdherenceHint: session.daysAgo % 3 === 0 ? 'missed_evening_dose_risk' : 'stable',
          }),
          activityIds[session.emotion],
          session.risk,
          time,
        ]
      );

      const sessionId = sessionResult.rows[0].id;
      const interventionResult = await client.query(
        `
          INSERT INTO emotional_support_interventions (
            session_id,
            elder_user_id,
            response_bank_id,
            response_type,
            response_text,
            response_source,
            trigger_emotion,
            trigger_risk_level,
            selected_because,
            follow_up_prompt,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'response_bank', $6, $7, $8::JSONB, $9, $10)
          RETURNING id
        `,
        [
          sessionId,
          session.elderId,
          responseBankIds[session.emotion],
          template.type,
          template.text,
          session.emotion,
          session.risk,
          JSON.stringify(['demo dashboard data', 'emotion-aligned safe response']),
          template.followUp,
          time,
        ]
      );

      const interventionId = interventionResult.rows[0].id;
      await client.query(
        `
          UPDATE emotional_support_emotion_sessions
          SET intervention_id = $1
          WHERE id = $2
        `,
        [interventionId, sessionId]
      );

      await client.query(
        `
          INSERT INTO chat_logs (
            session_id,
            elder_user_id,
            actor_type,
            message_type,
            message_text,
            detected_emotion,
            metadata,
            created_at
          )
          VALUES ($1, $2, 'elder', 'text', $3, $4, $5::JSONB, $6)
        `,
        [
          sessionId,
          session.elderId,
          session.input,
          session.emotion,
          JSON.stringify({ demoSeed: true, inputMode: 'text' }),
          time,
        ]
      );

      await client.query(
        `
          INSERT INTO chat_logs (
            session_id,
            elder_user_id,
            actor_type,
            message_type,
            message_text,
            detected_emotion,
            response_bank_id,
            intervention_id,
            metadata,
            created_at
          )
          VALUES ($1, $2, 'system', 'response', $3, $4, $5, $6, $7::JSONB, $8)
        `,
        [
          sessionId,
          session.elderId,
          template.text,
          session.emotion,
          responseBankIds[session.emotion],
          interventionId,
          JSON.stringify({
            demoSeed: true,
            responseType: template.type,
            followUpPrompt: template.followUp,
          }),
          time,
        ]
      );

      await client.query(
        `
          INSERT INTO emotional_support_activity_attempts (
            elder_user_id,
            session_id,
            activity_id,
            answer_text,
            score,
            completion_status,
            started_at,
            completed_at
          )
          VALUES ($1, $2, $3, $4, $5, 'completed', $6, $6)
        `,
        [
          session.elderId,
          sessionId,
          activityIds[session.emotion],
          `${activity.title}: demo elder completed this memory prompt.`,
          session.score,
          time,
        ]
      );

      if (session.alert) {
        await client.query(
          `
            INSERT INTO emotional_support_caregiver_alerts (
              elder_user_id,
              caregiver_user_id,
              session_id,
              alert_type,
              severity,
              title,
              message,
              explanation,
              status,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, 'open', $9)
          `,
          [
            session.elderId,
            DEMO_CAREGIVER_ID,
            sessionId,
            session.alert,
            session.risk === 'high' ? 'high' : 'medium',
            `${profile.name} needs attention`,
            `${profile.name} reported ${session.emotion} feelings with ${session.risk} risk.`,
            JSON.stringify({
              demoSeed: true,
              detectedEmotion: session.emotion,
              stressScore: session.stress,
              lonelinessScore: session.loneliness,
            }),
            time,
          ]
        );
      }
    }

    return {
      caregiverId: DEMO_CAREGIVER_ID,
      elderIds,
      sessionsInserted: demoSessions.length,
      alertsInserted: demoSessions.filter((session) => session.alert).length,
    };
  });
}

async function main() {
  try {
    const result = await seed();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed to seed emotional support demo data.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await getPool().end();
  }
}

main();
