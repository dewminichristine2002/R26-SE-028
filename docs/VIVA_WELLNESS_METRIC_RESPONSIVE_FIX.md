# Wellness Dashboard Responsive Metrics Fix

## Findings

The screenshot showed the Cognitive Engagement cards keeping the icon and value in a horizontal row. On narrow cards, the text column was too small, so Android split “Medium” and wrapped longer values awkwardly. The old grid also used percentage-based widths that did not account for the actual card content area.

The **Emotional Check-Ins** percentage is a distribution share, not classifier confidence. `wellnessTrendService` calculates each percentage as that emotion’s check-in count divided by all valid check-ins in the selected period, multiplied by 100. Thus one Loneliness check-in out of one recorded check-in is 100%. The calculation and data are unchanged. The screen now labels it **Share of recorded check-ins** and shows the selected-period sample size, for example **Based on 1 recorded check-in**.

## Changes

- The four Cognitive Engagement cards now place icon, value, and label vertically, with natural wrapping between words and no fixed card height.
- The grid measures its actual available content width. It uses two columns only when each card can be at least 144 dp wide after the 12 dp gap; otherwise it uses one column. Font scale above 1.15 also selects one column.
- This yields one column at the tested 320 dp and 360 dp screen widths, and two columns at 393 dp with standard font scale. Enlarged font scale switches the 393 dp case to one column.
- The long recorded-time explanation is now a compact information row. Existing duration formatting and backend data semantics are preserved.
- The My Wellness Home card was not changed. No backend, API, schema, database, emotion model, or calculation was changed.

## Files changed

- `frontend/src/features/emotionalSupport/screens/EmotionalTrendScreen.js`
- `frontend/src/features/emotionalSupport/utils/wellnessDashboardLayout.js`
- `frontend/src/features/emotionalSupport/screens/__tests__/wellnessDashboard.test.cjs`
- `docs/VIVA_WELLNESS_METRIC_RESPONSIVE_FIX.md`

## Verification

- Full frontend Jest: **13 suites, 116 tests passed**.
- Responsive layout tests cover 320, 360, and 393 dp content widths, large font scaling, vertical metric structure, Medium difficulty, long durations, missing values, and sample-size wording.
- JSX parser accepted `EmotionalTrendScreen.js`.
- Backend wellness trend service: **1 suite, 11 tests passed**, including its existing completed-session distribution tests. No database connection was used.
- `git diff --check` completed with exit code **0**. Git printed line-ending conversion notices for existing modified files.
- Android Expo export succeeded with `TEMP` and `TMP` set command-locally to the project temp folder. Expo reported **Android Bundled in 139,456 ms** and created the 3,017,574-byte Hermes bundle `frontend/.codex-tmp/wellness-metric-responsive-export/_expo/static/js/android/AppEntry-53ea8043bed1748274b331220aef0863.hbc`. The bundle contains the new distribution title, sample wording, metric title, duration note, and difficulty label.
- No `adb` command or connected physical device was available. Export proves JavaScript bundling only; it does not prove Android rendering. The layout issue remains pending physical-device verification.

## Android device verification checklist

1. Start Metro from `frontend` with `npm run start:dev-client` (use the local `TEMP`/`TMP` workaround documented in the prior My Wellness report if required), then open the existing Development Build on the phone.
2. Open **My Wellness** → **Your Wellness** and the Cognitive Engagement section.
3. At 320 dp and 360 dp, confirm each statistic uses one column; at 393 dp with standard font scale, confirm two columns only if all cards have adequate width.
4. Increase Android display/font size and confirm the grid switches to one column.
5. Confirm icon, value, and label appear top-to-bottom, and “Medium”, “Easy”, and “Hard” remain whole words. Check a long duration wraps only at spaces.
6. Confirm missing values show “—” and zero counts remain visible.
7. In Emotional Check-Ins, verify the percentage is labeled as a share, and the displayed sample size matches the selected period. Confirm one check-in displays “Based on 1 recorded check-in”.
8. Confirm the compact recorded-time information row and existing Activity Accuracy, Recent Activity, summary, and return navigation still work.

Do not consider the visual issue resolved until this checklist is checked on the physical Android device.
