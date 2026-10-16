# Word Completion Answer Submission Fix

## Root cause

The Word Completion screen presented a puzzle with one hidden letter, but sent its typed value in the generic `selectedAnswer` field. The server passed that value through the ordinary single-choice scorer, which only accepted one of the hidden full-word option IDs. For `M _ RNING`, the client sent `selectedAnswer: "o"`; no full-word option had ID or label `o`, so the server returned HTTP 400 with “A valid answer option is required.”

The existing server-side bank stores each item's full correct word. The scoring service now locates the single underscore in that item's own prompt, checks that the prompt pattern aligns with its server-side correct word, and compares the submitted letter with the corresponding character. The public task sanitizer continues to remove answer keys before sending tasks to the app.

## Submission contract

The request shape remains unchanged:

```json
{
  "user_id": 1,
  "response": {
    "itemResponses": [
      { "itemId": "wd_m3", "selectedAnswer": "o", "responseTimeMs": 1200 }
    ]
  }
}
```

The server trims surrounding whitespace, compares case-insensitively, and accepts exactly one ASCII letter for an active Word Completion item. A wrong single letter is a valid gameplay response and receives score 0. Empty and multi-character answers receive friendly HTTP 400 validation messages. Skips remain supported.

## Verified responses

- `O`, `o`, and `  o  ` for `M _ RNING`: HTTP 200, `success: true`, `accuracy: 1`, `is_correct: true`, `correct_answers: 1`.
- `A` for `M _ RNING`: HTTP 200, `success: true`, `accuracy: 0`, `is_correct: false`, `correct_answers: 0`.
- Empty or whitespace-only answer: HTTP 400, “Please enter the missing letter.”
- Multi-character answer: HTTP 400, “Please enter one letter only.”
- Word Completion examples from Easy, Medium, and Hard patterns were scored using each item's own prompt and correct word.

The backend controller tests use a mocked repository, so they exercise controller validation and real scoring without opening a database transaction or writing to Supabase. No live participant attempt was submitted.

## Files changed for this fix

- `backend/src/services/cognitiveActivityScoringService.js` — added item-specific missing-letter scoring and input validation.
- `backend/src/controllers/activityExecutionController.js` — maps missing-letter validation errors to HTTP 400.
- `backend/tests/unit/controllers/activityExecutionController.test.js` — submission-boundary coverage for correct, incorrect, empty, whitespace, multi-character, skip, duplicate, and recovery cases.
- `backend/tests/unit/services/cognitiveActivityScoringService.test.js` — verifies multiple Word Completion patterns and typed-letter scoring.
- `frontend/src/features/emotionalSupport/screens/CognitiveActivityScreen.js` — clarifies that the input is one missing letter and validates before submission.
- `frontend/src/features/emotionalSupport/screens/__tests__/cognitiveActivityLibrary.test.cjs` — updates the screen contract assertion to the missing-letter prompt.

## Test results

- Backend unit suite: **27 suites passed, 356 tests passed** (`npm run test:unit -- --runInBand`). This includes the controller submission-boundary tests and cognitive scoring tests. Repository calls are mocked for the new API contract checks.
- Frontend Jest suite: **10 suites passed, 76 tests passed** (`npm test -- --runInBand`).
- `git diff --check`: exit code 0. Git emitted existing line-ending notices; no whitespace errors were reported.
- No migrations or database writes were performed by the test suites.

## Applying the fix to the phone

Restart the Node backend so it loads the updated scoring code, then reload the app. The backend restart will repeat its configured `SELECT 1` connection check; automatic schema changes remain disabled. A new APK is not needed when the phone is using the development client and Metro serves the JavaScript bundle. A standalone or release APK must be rebuilt to include the frontend JavaScript change.

The tests verify the submission contract, not a physical-device playthrough or a database-backed attempt. Confirm on the phone by starting Word Completion, entering `O` for `M _ RNING`, and checking that the game accepts it. `A` should submit as an incorrect gameplay answer, not a network/request error.
