# Cognitive Activity Library UI Redesign

## Previous layout issues

The activity list used a single horizontal row for the icon, title/description, metadata, and a small Play control. On narrow phones this crowded the text column, clipped descriptions to two lines, and made the action target visually secondary. The suggested activity used a generic star instead of identifying the recommended game.

## New card structure

Each activity now uses a flexible vertical card: a game-specific icon beside a wrapping title and full description; a wrapping metadata row with recommended pace, duration when supplied by the API, and a short activity category; then a prominent full-width Play Activity button. Cards have no fixed height. The suggested card uses the recommended activity's own icon and retains the server-selected recommendation, displayed suggested pace, description, and existing difficulty-selection behavior.

The eight visual identities correspond to the existing activity codes: Word Category Match, Odd One Out, Word Completion, Pattern Sequence, Short Memory Recall, Orientation Activity, Simple Math & Counting, and Sequence Ordering. Icons are text/vector-like glyphs rendered locally, with existing activity palette colors. They require no new packages. Icons are decorative to screen readers; each action button has a title-specific accessible label.

## Functionality preserved

The screen still loads the same API result, preserves the server activity ordering and recommendation, and opens the existing `CognitiveActivityScreen` route with the same self-selected context. The existing supported-difficulty modal, retry/loading/empty states, and error behavior remain in place. No gameplay screen, backend, API, database, model, or recommendation logic was changed.

## Files changed

- `frontend/src/features/emotionalSupport/screens/CognitiveActivityLibraryScreen.js`
- `frontend/src/features/emotionalSupport/screens/__tests__/cognitiveActivityLibrary.test.cjs`
- `docs/VIVA_COGNITIVE_ACTIVITY_LIBRARY_FINAL_UI.md`

## Accessibility and responsive layout

- Titles and descriptions wrap without line limits; cards have flexible height and width.
- Metadata wraps on narrow screens rather than forcing a three-column layout.
- The full-width Play button has a 56 dp minimum height and a title-specific accessibility label.
- Font scaling remains enabled for the icon/title/description and button text.
- Text labels and distinct game-specific symbols supplement color so color is not the only identifier.

## Verification

- Frontend Jest: **11 suites passed, 85 tests passed**.
- Babel Expo preset parse of `CognitiveActivityLibraryScreen.js`: **passed**.
- `git diff --check`: **passed** (Git printed existing line-ending conversion notices for several workspace files).
- Android development bundle requested from Metro: **HTTP 200**, 8,987,733 bytes. No standalone/release APK was built; the installed development client can receive this JavaScript bundle from Metro.
- Metro is running on this computer at `192.168.1.3:8083`. The phone must be on the same Wi-Fi network. Physical-device visual testing remains pending.

## Device checklist

1. Open Play an Activity from Component 4 Home and confirm the eight activities retain their prior order and the suggested game remains the server recommendation.
2. On each card, check the game-specific icon, full title, full description, recommended pace, any supplied duration, category label, and full-width Play Activity button.
3. Tap every Play Activity button and confirm the existing game opens. Test the suggested card and confirm its difficulty picker still opens when multiple difficulties are supported.
4. Check loading, retry/error, and empty states by using the existing environment conditions; confirm retry remains usable.
5. Repeat on a 320 dp-wide Android screen and with larger system text. Confirm titles/descriptions wrap and the buttons remain easy to tap.
6. Open and finish one game to confirm Activity Complete and return navigation remain unchanged.

## Remaining limitations

Glyph appearance can vary by Android font. UI verification on a physical device depends on the user opening the refreshed development client; no device-rendering claim is made in this report.
