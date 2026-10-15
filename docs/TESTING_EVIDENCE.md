# Testing Evidence

Generated at: 2026-08-31T16:08:33.590Z

| Category | Status | Command |
| --- | --- | --- |
| Unit | PASS | `npm.cmd run test:unit` |
| Integration | PASS | `npm.cmd run test:integration` |
| NFR | PASS | `npm.cmd run test:nfr` |
| E2E | PASS | `npm.cmd run test:e2e` |

## Unit

Status: PASS

Started: 2026-08-31T16:08:00.912Z

Finished: 2026-08-31T16:08:09.083Z

```text
> eldermeds-backend@1.0.0 test:unit
> jest --runInBand tests/unit


PASS tests/unit/services/assistantOrchestrator.test.js
PASS tests/unit/repositories/adaptiveQuestionQuickReplies.test.js
PASS tests/unit/services/emotionPredictionService.test.js
PASS tests/unit/services/reminiscenceAlertService.test.js
PASS tests/unit/services/wellnessTrendService.test.js
PASS tests/unit/services/contextualAnswerInterpretationService.test.js
PASS tests/unit/controllers/reminiscenceEntriesController.test.js
PASS tests/unit/services/activityExecutionRepository.test.js
PASS tests/unit/services/adaptiveQuestionSelector.test.js
PASS tests/unit/services/adaptiveResultAggregator.test.js
PASS tests/unit/services/cognitiveActivityScoringService.test.js
PASS tests/unit/services/riskAssessmentService.test.js
PASS tests/unit/repositories/elderFriendlyWordingMigration.test.js
PASS tests/unit/services/explicitEmotionEvidenceService.test.js
PASS tests/unit/controllers/activityExecutionController.test.js
PASS tests/unit/services/reminiscenceMemoryService.test.js
PASS tests/unit/services/narrativeAnalysisService.test.js
PASS tests/unit/services/strokePredictionService.test.js
PASS tests/unit/services/cognitiveDifficultyService.test.js
PASS tests/unit/services/activityRecommendationService.test.js
PASS tests/unit/services/conversationAcknowledgementService.test.js
PASS tests/unit/services/adaptiveRiskRepository.test.js
PASS tests/unit/services/activityPreferenceService.test.js
PASS tests/unit/services/activityRecommendationAlternatives.test.js

Test Suites: 24 passed, 24 total
Tests:       231 passed, 231 total
Snapshots:   0 total
Time:        4.054 s, estimated 6 s
Ran all test suites matching /tests\\unit/i.
```

## Integration

Status: PASS

Started: 2026-08-31T16:08:09.083Z

Finished: 2026-08-31T16:08:19.960Z

```text
> eldermeds-backend@1.0.0 test:integration
> jest --runInBand tests/integration


(node:23584) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
PASS tests/integration/systemRoutes.integration.test.js (6.272 s)
PASS tests/integration/predictRoutes.integration.test.js

Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Snapshots:   0 total
Time:        6.783 s, estimated 8 s
Ran all test suites matching /tests\\integration/i.
```

## NFR

Status: PASS

Started: 2026-08-31T16:08:19.960Z

Finished: 2026-08-31T16:08:25.091Z

```text
> eldermeds-backend@1.0.0 test:nfr
> jest --runInBand --verbose tests/nfr


PASS tests/nfr/predictionWorkflow.nfr.test.js
  prediction workflow non-functional requirements
    √ performance: deterministic stroke text parsing stays under the chat latency budget (15 ms)
    √ reliability: stroke explanation falls back when the LLM dependency fails (5 ms)
    √ usability: generated risk summaries use plain, actionable wording with safety context (4 ms)
    √ usability: ML validation errors are normalized into readable messages
    √ security: protected endpoints reject requests without a bearer token (4 ms)
    √ reliability: database-backed endpoints return 503 when the database is unavailable (1 ms)

PASS tests/nfr/systemRequirements.nfr.test.js
  system non-functional requirements coverage
    √ maintainability: every backend route family has integration coverage declared (2 ms)
    √ maintainability: the E2E journey covers every backend route family (1 ms)
    √ security: route files that expose personal health data use an auth guard (2 ms)
    √ reliability: database-backed route families use database status gating where required (1 ms)
    √ usability: categorized test commands exist for simple terminal execution (1 ms)

Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        1.307 s, estimated 2 s
Ran all test suites matching /tests\\nfr/i.
```

## E2E

Status: PASS

Started: 2026-08-31T16:08:25.091Z

Finished: 2026-08-31T16:08:33.590Z

```text
> eldermeds-backend@1.0.0 test:e2e
> jest --runInBand tests/e2e


(node:25992) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
PASS tests/e2e/systemJourney.e2e.test.js
PASS tests/e2e/predictionChat.e2e.test.js

Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        4.898 s, estimated 8 s
Ran all test suites matching /tests\\e2e/i.
```
