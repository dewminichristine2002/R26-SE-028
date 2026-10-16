# My Wellness Dashboard UI and Duration Fix

## What changed

- The Home screen’s **My Wellness** entry is now a mint card with a heart/pulse mark, concise description, and full-width **View My Wellness** button. It still navigates to `EmotionalTrendScreen`.
- Dashboard statistics use compact, content-sized cards in a two-column grid. The layout stacks below 350 dp or above 1.25 system font scale. Metric accents distinguish the values while retaining the cream, white, and forest-green theme.
- Section spacing, check-in timeline rows, and recent activity rows are more compact. Existing charts, summary controls, loading/error handling, and empty states remain available.
- Missing metric values remain “—”; legitimate zero counts remain visible.

## Duration investigation

The Android screenshot’s `5554.6 sec` value corresponds to about **1 hr 32 min**. The previous UI formatted milliseconds directly as seconds. More significantly, `activityExecutionRepository.completeAttempt` ignored its `responseTimeMs` argument and instead stored the wall-clock interval from the database attempt’s `started_at` to completion. That interval can include time the app was idle between rounds.

The cognitive game already sends a `responseTimeMs` measurement for each question. The backend now adds those validated, finite, non-negative question intervals and persists the total for cognitive attempts. The elapsed start-to-submit interval is still used by the existing difficulty recommendation, so its behavior is unchanged. Non-cognitive activities retain their existing elapsed-time behavior. No API field or database structure changed.

The dashboard formats future recorded values as seconds, minutes plus seconds, or hours plus minutes. Historical records were not updated and cannot be distinguished from newer records without adding a schema marker. The screen therefore calls this **Average recorded time** and explains that older entries can include idle time. A timer on an open question can also include time while the app is paused on that question.

## Files changed for this task

- `frontend/src/features/emotionalSupport/screens/ElderHomeScreen.jsx`
- `frontend/src/features/emotionalSupport/screens/EmotionalTrendScreen.js`
- `frontend/src/features/emotionalSupport/utils/wellnessFormatters.js`
- `frontend/src/features/emotionalSupport/screens/__tests__/wellnessDashboard.test.cjs`
- `backend/src/controllers/activityExecutionController.js`
- `backend/src/repositories/activityExecutionRepository.js`
- `backend/tests/unit/controllers/activityExecutionController.test.js`
- `backend/tests/unit/repositories/activityExecutionRepository.test.js`
- `docs/VIVA_MY_WELLNESS_DASHBOARD_FINAL_UI.md`

The worktree contained other pre-existing edits before this task; they were preserved.

## Verification results

- Frontend: `npm test -- --runInBand` — **13 suites, 106 tests passed**.
- Backend duration/API coverage: controller, repository, and wellness trend service suites — **3 suites, 29 tests passed**.
- Backend syntax: `node --check` passed for the activity controller, repository, and wellness trend service.
- JSX parse: Babel parser accepted `ElderHomeScreen.jsx` and `EmotionalTrendScreen.js`.
- `git diff --check` — exit code **0**. Git emitted existing line-ending conversion notices only.
- Android export: the first `npx expo export --platform android` attempt failed because Expo’s temp-directory helper could not `lstat C:\Users\HP` (`EPERM`). Retrying with command-local `TEMP` and `TMP` pointed at `frontend/.codex-tmp/tmp` succeeded. Expo reported **Android Bundled in 195,855 ms** and wrote a 3,014,967-byte Hermes bundle at `.codex-tmp/wellness-dashboard-android-export/_expo/static/js/android/AppEntry-e4b1a83671c7316876ac465a994b8133.hbc`. I confirmed the generated bundle contains both `Average recorded time` and `View My Wellness`. Metro export is verified; no live Metro server, phone rendering, or navigation was tested.

## Android manual verification

To load the current source in the existing Expo Development Build, open PowerShell in `frontend` and run:

```powershell
$taskTemp = Join-Path (Get-Location) '.codex-tmp\tmp'
New-Item -ItemType Directory -Force -Path $taskTemp | Out-Null
$env:TEMP = $taskTemp
$env:TMP = $taskTemp
npm run start:dev-client
```

Keep that terminal open. The launcher prints the current LAN IP and Metro port. Connect the phone to the same Wi-Fi, open ElderMeds Development Build, and select/scan the Metro development server shown there. Then complete these checks:

1. Reload the existing ElderMeds Development Build and sign in with the usual authorized development account.
2. On Home, confirm My Wellness has a distinct mint card, heart/pulse icon, readable description, and full-width View My Wellness button. Tap it and confirm the Wellness screen opens.
3. Check 7 Days and 30 Days. Confirm the top summary, emotional check-in history, Cognitive Engagement metrics, Activity Accuracy, Recent Activity, and Wellness Summary remain present.
4. On a small screen and with Android font size enlarged, confirm metric cards stack and all labels remain readable without clipping.
5. Verify zero-activity and missing-metric states, then use the retry action after temporarily making the backend unavailable.
6. Complete a cognitive activity and confirm a new recorded time is shown in a readable unit. Compare its value with the displayed question intervals; older history may still contain idle time.
7. Confirm the back action returns to Home. Do not interpret the dashboard as a medical assessment.

Physical Android verification remains pending until these steps are performed on the device.
