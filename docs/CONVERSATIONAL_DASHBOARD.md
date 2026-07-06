# Unified Conversational Dashboard \u2014 implementation guide

This document describes the RAG-based conversational dashboard added to ElderMeds:

- A natural-language **chat assistant** grounded in the patient\u2019s own healthcare records.
- A **Unified Dashboard** screen with summary cards (adherence, missed doses, mood trend, alerts, low stock, medicine safety, routine).
- A **persistent floating AI button** on the Home and Dashboard screens.
- **Voice input/output** via `expo-speech-recognition` and `expo-speech`.

The architecture is the two-stage RAG pipeline described in the spec:

```
user question
   \u2192 spaCy preprocess (ml-service)
   \u2192 Llama 3 NL2SQL  (ml-service POST /assistant/nl2sql)
   \u2192 SQL safety validator (Node)
   \u2192 PostgreSQL (with $1 = current user id, statement_timeout 5s, LIMIT 100)
   \u2192 Llama 3 conversational answer (ml-service POST /assistant/answer)
   \u2192 reply persisted in assistant_messages
   \u2192 returned to the React Native app
```

## Files added

### Backend (`backend/`)

| File | Purpose |
|---|---|
| `src/data/schemaDescription.js` | Schema catalog the LLM is allowed to see |
| `src/services/sqlValidator.js` | Strict SELECT-only safety validator |
| `src/services/assistantSummaryService.js` | Canned dashboard cards (no LLM) |
| `src/services/assistantOrchestrator.js` | Chat round-trip + persistence |
| `src/controllers/assistantController.js` | Express controllers |
| `src/routes/assistant.js` | `/api/assistant/*` with auth + per-user rate limit |
| `migrations/<ts>_assistant_tables.js` | `assistant_conversations` + `assistant_messages` |

### ml-service (`ml-service/`)

| File | Purpose |
|---|---|
| `app/services/ollama_client.py` | Async Ollama HTTP wrapper |
| `app/services/spacy_preprocess.py` | spaCy normalisation + keyword/time hints |
| `app/services/nl2sql.py` | Stage 1: schema-aware NL2SQL |
| `app/services/rag_answer.py` | Stage 2: conversational reply |
| `app/prompts/nl2sql_system.txt` | NL2SQL system prompt with hard safety rules and few-shots |
| `app/prompts/answer_system.txt` | Answer system prompt with hallucination guard |
| `app/routers/assistant.py` | FastAPI endpoints |

### Frontend (`frontend/`)

| File | Purpose |
|---|---|
| `src/services/assistantService.js` | Client for `/api/assistant/*` |
| `src/components/AssistantFAB.js` | Floating AI button |
| `src/components/SummaryCard.js` | Card UI for the dashboard |
| `src/components/ChatBubble.js` | Bubble + "show source" + "read aloud" |
| `src/screens/UnifiedDashboardScreen.js` | Dashboard screen |
| `src/screens/AssistantChatScreen.js` | Chat screen with voice STT/TTS |

## API surface (Node)

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/api/assistant/summary` | Builds dashboard cards (no LLM, fast) |
| `POST` | `/api/assistant/chat` | Body: `{ message, conversationId? }` \u2192 `{ answer, sql, rows, fallback, followUps, conversationId }` |
| `GET`  | `/api/assistant/conversations` | List user\u2019s conversations |
| `GET`  | `/api/assistant/conversations/:id/messages` | Full chat log for one conversation |

All endpoints require `Authorization: Bearer <jwt>`.

## Database

Two new tables:

```
assistant_conversations(id, user_id FK users, title, created_at, updated_at)
assistant_messages(id, conversation_id FK, user_id FK,
                   role 'user'|'assistant'|'system',
                   content, sql_used, rows_returned jsonb,
                   intent, fallback_reason, latency_ms, created_at)
```

Run the migration:

```bash
cd backend
npm run db:migrate
```

The chatbot also reads (read-only) every table listed in `schemaDescription.js`. If you have not yet run the older migrations that create `medicines`, `user_medications`, `medication_stock`, `medication_status_events`, `caregiver_alerts`, the dashboard cards for those areas will degrade gracefully (the summary service uses `information_schema` to skip missing tables).

## Environment variables

`backend/.env` (additions):

```env
ML_SERVICE_URL=http://localhost:8000
ML_TIMEOUT_MS=60000
ASSISTANT_SQL_TIMEOUT_MS=5000
ASSISTANT_MAX_ROWS=100
ASSISTANT_RATE_LIMIT_PER_MIN=30
```

`ml-service` reads via the `ELDERMEDS_ML_*` env prefix. Optional overrides:

```env
ELDERMEDS_ML_OLLAMA_BASE_URL=http://localhost:11434
ELDERMEDS_ML_OLLAMA_MODEL=llama3:8b
ELDERMEDS_ML_OLLAMA_TIMEOUT_SECONDS=60
ELDERMEDS_ML_OLLAMA_TEMPERATURE=0.1
ELDERMEDS_ML_OLLAMA_NUM_PREDICT=512
ELDERMEDS_ML_SPACY_MODEL=en_core_web_sm
ELDERMEDS_ML_RAG_MAX_ROWS_IN_CONTEXT=50
```

## One-time setup

### 1. Ollama + Llama 3

Install Ollama on the machine that runs the ml-service:

```bash
# Windows / macOS
# https://ollama.com/download

# pull the model (8B is fine; bigger = slower but more accurate)
ollama pull llama3:8b

# verify
ollama run llama3:8b "say hello"
```

Ollama listens on `http://localhost:11434` by default.

### 2. ml-service Python deps

```bash
cd ml-service
.venv\Scripts\activate          # Windows
# or: source .venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 3. Backend migration

```bash
cd backend
npm install
npm run db:migrate
```

## Running the stack

Three processes (in separate terminals):

```bash
# 1) Ollama (usually auto-starts after install)
ollama serve

# 2) ml-service
cd ml-service
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# 3) backend
cd backend
npm run dev

# 4) frontend (Expo dev client)
cd frontend
npm start
```

Then open the app, log in, tap the floating "AI" button (or the Dashboard tile on the home grid) and ask:

- *"Did I miss any medicine this week?"*
- *"Which medicines are running low?"*
- *"How has my mood been recently?"*
- *"Are any of my saved medicines dangerous for me?"*

## Security model

The chat endpoint enforces the following on every request:

1. **JWT authentication** \u2014 `req.user.id` is the only user ever bound to `$1`.
2. **Hard SQL allowlist** \u2014 only tables in `schemaDescription.js` may be referenced.
3. **`SELECT`-only** \u2014 anything DDL/DML is rejected, plus any `pg_*`, `information_schema`, comments, multi-statement, `COPY`, etc.
4. **User scoping mandatory** \u2014 every user-scoped table must include `<table>.<userIdColumn> = $1`. The validator refuses queries that lack it.
5. **Param scoping** \u2014 only `$1` is allowed. The LLM cannot invent extra parameters.
6. **`statement_timeout = 5s`** and **`LIMIT 100`** are forced before execution.
7. **PII redaction before the LLM** \u2014 password_hash, email, phone, caregiver_email, caregiver_phone are stripped from rows passed to the answer prompt.
8. **Rate limit** \u2014 default 30 chat requests per minute per user.
9. **Hallucination guard** \u2014 the answer prompt forbids inventing facts and the UI exposes a "Show source" panel with the SQL and the actual rows the answer is based on.
10. **Disclaimer banner** in the chat screen.

If the LLM produces SQL that fails any check, the user sees a polite *"I cannot answer that safely"* message and the failure reason is stored in `assistant_messages.fallback_reason` for analytics.

## Caregiver mode

Caregiver login (already implemented in `routes/auth.js`) issues a JWT whose `userId` already points at the elder's `users.id`. The assistant therefore works identically for caregivers \u2014 the same WHERE-clause scoping applies, no extra changes needed. The `user_role` in the prompt is informational only and influences phrasing.

## Adding a new question type

If you want the assistant to answer a new domain (say, "show me my last prescription scan"):

1. Make sure the relevant table is exposed in `backend/src/data/schemaDescription.js` (or expand a missing entry).
2. Add a few-shot example to `ml-service/app/prompts/nl2sql_system.txt`.
3. Optionally add a deterministic summary card to `assistantSummaryService.js`.
4. Restart the ml-service so the prompt is reloaded.

That's it \u2014 no code change in Node, the validator handles new tables automatically as long as they're in the catalog.

## Testing the round-trip without the LLM

You can test the SQL sandbox alone by hitting the validator directly from a Node REPL:

```js
const { validateAndPrepareSql } = require('./src/services/sqlValidator');
validateAndPrepareSql("SELECT medicine_name FROM user_medications WHERE user_id = $1 LIMIT 5");
// \u2192 { sql: '...', referencedTables: ['user_medications'] }

validateAndPrepareSql("SELECT * FROM users; DROP TABLE users;");
// \u2192 throws SQL_FORBIDDEN
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Chat returns "I can't reach the AI assistant right now." | ml-service not running or `ML_SERVICE_URL` wrong | `uvicorn app.main:app --port 8000`, check `backend/.env` |
| Chat returns "I cannot answer that safely." | LLM produced SQL that broke a safety rule | Inspect `assistant_messages.sql_used` and `fallback_reason`; tighten or extend the system prompt |
| Empty cards on the dashboard | Tables missing in your DB (e.g. `medication_status_events`) | Run the older migration that creates them, or commit the missing migration |
| Voice button does nothing | `expo-speech-recognition` not present in the build | Build a new EAS dev client; on Expo Go the lib silently no-ops |
| Llama 3 too slow | 8B model on CPU is slow; try a smaller quantised model: `ollama pull llama3:8b-instruct-q4_K_M` |
| `ASSISTANT_RATE_LIMIT_PER_MIN` exceeded | The rate limit is in-memory per user | Tune env var or add Redis later |
