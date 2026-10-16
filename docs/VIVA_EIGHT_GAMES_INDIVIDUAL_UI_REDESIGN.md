# ElderMeds Eight Cognitive Games UI Redesign

## Discovered game families

The backend registry in `backend/src/data/cognitiveActivityBank.js` defines eight families. The display names below match the actual Component 4 activity catalog.

| Activity name | Identifier | Existing interaction | Individual presentation |
| --- | --- | --- | --- |
| Word Category Match | `word_category` | Choose one matching option | Lavender category prompt panel and large two-column illustrated choice cards |
| Odd One Out | `odd_one_out` | Choose one option | Blue “what is different” prompt and large selectable object cards; only supplied options appear |
| Word Completion | `word_completion` | Type the missing character | Letter tiles with highlighted blank and a purpose-labeled letter input; input length follows the number of blanks in the prompt |
| Pattern Sequence | `pattern_sequence` | Choose the next option | Actual bank sequence rendered as large pattern tiles, a missing-position tile, and distinct shape/color/number choice tiles |
| Short Memory Recall | `short_memory_recall` | Memorize items, then select remembered items | Separate Memorize and Recall phases; two-column object cards on wider screens, large labeled choices in Recall |
| Orientation Activity | `orientation_activity` | Choose one everyday time/order answer | Mint “Everyday Time & Order” prompt panel with clear answer choices |
| Simple Math & Counting | `simple_math` | Choose one numeric answer | Centered, warm number prompt card and uncluttered answer choices; the supplied question text and answer IDs are unchanged |
| Sequence Ordering | `sequence_ordering` | Tap steps into order; reset is available | Numbered progress rail, step-specific illustration/text cards, visible order positions, and existing restart action |

## Object illustration inventory

`frontend/src/features/emotionalSupport/utils/cognitiveItemIllustrations.js` is a deterministic exact-label manifest for the item names and step phrases used by the actual bank. It uses local Unicode glyphs in the app’s existing illustration tiles, requires no new package, and exposes each item label to accessibility services. Matching is case-insensitive after trimming but does not use substring matching.

The reported examples are corrected: Orange maps to an orange glyph distinct from Apple; Plate and Spoon resolve to distinct glyphs; Garden, Mirror, Bicycle, Guitar, and Piano each have their own mapping. The same resolver is used in memory Study and Recall and in ordered-step cards.

Where no reliable matching glyph is mapped, the component shows a neutral tile containing the exact item name. For example, Pillow uses the text fallback instead of a bed or a generic dot. This is intentional and prevents an incorrect picture. The manifest test audits all bank option and study labels to ensure every label resolves to either an explicit glyph or a labeled fallback.

All recall options remain server-provided options with the original IDs. The visual mapping looks only at visible labels. It does not read or expose `correctAnswer`, `correctAnswers`, or `correctOrder`.

## Activity completion screen

The shared completion card now uses a warm cream screen with a white card, a small mint achievement mark, and forest-green typography. It displays the server activity title and difficulty, then two balanced statistic cards: answered versus rounds (with skipped count) and correct count. Counts are derived from the returned result; no score is invented. Play Again, Try Another Activity/Return to Results, and Return Home navigation retain their existing routes.

## Files changed

- `frontend/src/features/emotionalSupport/screens/CognitiveActivityScreen.js`
- `frontend/src/features/emotionalSupport/utils/cognitiveItemIllustrations.js`
- `frontend/src/features/emotionalSupport/screens/__tests__/cognitiveGamesExperience.test.cjs`
- `frontend/src/features/emotionalSupport/utils/__tests__/cognitiveItemIllustrations.test.cjs`
- `docs/VIVA_EIGHT_GAMES_INDIVIDUAL_UI_REDESIGN.md`

The activity library screen, backend question bank, API contract, scoring, adaptive difficulty, database, and emotion component were not changed for this task.

## Verification

- Focused cognitive/asset/library tests: **3 suites passed, 14 tests passed**.
- Full frontend Jest suite: **11 suites passed, 83 tests passed**.
- Babel Expo preset parse of `CognitiveActivityScreen.js`: **passed** (`JSX_PARSE_OK`).
- `adb devices` could not run because Android Debug Bridge is not installed or on `PATH`; no physical-device rendering or screenshot comparison is claimed.
- Android bundle was **not verified**: Expo's first export invocation rejected the explicit project-directory argument; the corrected Expo export did not finish in this environment, and the direct React Native bundle command reported that this Expo project has no standalone Metro config. This is not reported as a successful bundle.
- No backend test, database write, migration, or model change was performed for this frontend-only task.

## Limitations and APK guidance

- Glyph artwork uses the device's local emoji/font rendering and can vary slightly across Android font versions. Unmapped labels remain readable neutral tiles instead of receiving a potentially incorrect image.
- No Android device is available through this environment, so tap targets, large system font rendering, and final layouts still need a physical-device check.
- For the Expo development client, reload from Metro to receive the updated JavaScript. A standalone or release APK needs a new build to include these frontend changes.

## Manual Android check

1. Reload the development client and open each of the eight activities from the activity library.
2. Check a Short Memory Recall round: confirm each Study item has its matching illustration and label, then confirm its Recall option uses the same illustration and its original answer selection still works.
3. Check Odd One Out and Word Category Match cards, including Orange/Apple and Plate/Spoon if those labels appear.
4. Try Word Completion with the letter required by the shown blank; check a wrong letter and an empty entry.
5. Check shape, color, and number Pattern Sequence rounds; check Sequence Ordering selection and restart.
6. Check Orientation and Simple Math prompts, then complete an activity and confirm title, difficulty, answered, skipped, correct, Play Again, Try Another Activity, and Return Home.
7. Repeat on a 320dp-wide device or emulator with the largest supported system text setting.
