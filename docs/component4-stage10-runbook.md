# Component 4 Final Runbook

## Development startup

1. PostgreSQL and backend

   ```powershell
   cd backend
   npm install
   npm run db:migrate
   npm start
   ```

   Required database configuration is either `DATABASE_URL`, or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`. Optional connection controls include `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_CONNECTION_TIMEOUT_MS`, `DB_QUERY_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, and `DB_POOL_MAX`.

2. Emotion service

   ```powershell
   cd backend/ml/emotion_classifier
   python -m pip install -r requirements.txt
   python -m uvicorn api_service:app --host 127.0.0.1 --port 8001
   ```

   Confirm `GET http://127.0.0.1:8001/health` reports `ready: true` and model version `tfidf_linear_svm_calibrated_v2`. The backend uses `EMOTION_ML_SERVICE_URL`, defaulting to `http://localhost:8001`. If the service is unavailable, times out, or returns malformed data, check-ins continue using the deterministic rule fallback; the backend does not fabricate confidence or model version.

3. React Native application

   ```powershell
   cd frontend
   npm install
   npm start
   ```

   Configure the existing frontend API base URL for the device/emulator. A physical device cannot use its own `localhost` to reach a development computer.

## Runtime artifacts

- Must commit: `emotion_pipeline.pkl`, `selected_model_metadata.json`, `api_service.py`, `predict_emotion.py`, and `requirements.txt`. These are required to serve the selected model after cloning.
- Should commit for research reproducibility, subject to dataset licensing: `build_training_dataset.py`, `training_dataset_v2.csv`, `project_evaluation_set.csv`, `train_emotion_model.py`, and `evaluate_project_utterances.py`.
- Generated/optional evidence: CSV files under `results/` and the duplicate `results/selected_model_metadata.json`.
- Should ignore: `__pycache__/`, `.pyc`, runtime logs, and temporary service output.
- Legacy artifacts such as `emotion_classifier.pkl` and `tfidf_vectorizer.pkl` are not loaded by the v2 API and should not be treated as required v2 runtime files.

## Viva demo user and path

The prepared synthetic user is `component4-stage10-viva-ready@eldermeds.local` (current demo database ID 53). It contains no real personal or emotional data.

Recommended live sequence:

1. Sign in with a dedicated synthetic presentation account linked to the same demo user, or recreate the controlled demo using `node scripts/demoStage10EndToEnd.js` on an isolated demo database.
2. Start Adaptive Check-In and show “Question 1 of 5”.
3. Give a clear emotional answer and show that the next question changes while question numbers remain backend-controlled.
4. Finish exactly five questions and show the non-technical Support Result.
5. Start the routed activity; for cognitive activity, show that the answer is scored by the server as Activity Accuracy.
6. Complete reminiscence and calming examples and point out that neither has correctness or accuracy.
7. Open 7-day and 30-day Wellness Trends.
8. Explain the caregiver rule using the prepared loneliness rows: first and second medium, third high with one alert, fourth high with suppression.

Internal explainability remains in persisted metadata for question selection, aggregation, activity selection, difficulty, and caregiver alert decisions. These objects are intentionally not rendered in the elderly-user UI.

## Scope and interpretation

The emotion model test Macro F1 is approximately 0.616. Loneliness has only 58 dataset examples, and cognitive-fog classification remains a weaker research area. The system uses fallback rules, has no speech or voice-emotion processing, and has not been clinically validated. Cognitive activities are engagement tasks, not MMSE/MoCA or diagnosis. Cognitive performance never creates caregiver alerts.
