# Elder-Centered Conversational Engagement Upgrade

**ElderMeds — Emotional & Cognitive Support Component (Experience + Personalization Stage)**

> A voice-first, context-aware adaptive emotional and cognitive engagement system for older adults
> that combines conversational NLP, longitudinal context, preference-aware activity recommendation,
> adaptive cognitive engagement, and consent-based personalized reminiscence.
>
> This component is **non-clinical**. It supports wellbeing and engagement and does not diagnose,
> screen, or score any medical or cognitive condition.

---

## A. Existing architecture inspected

| Layer | Components (unchanged unless noted) |
|---|---|
| Emotion pipeline | MiniLM v4 (`ml/emotion_classifier`) + Logistic Regression via `ml-service`, `narrativeAnalysisService`, `explicitEmotionEvidenceService`, `contextualAnswerInterpretationService`, `answerPolarityService` |
| Adaptive conversation | `adaptiveQuestionSelector` (target-state scoring, branch codes, dimension diversity), 5-turn session contract in `adaptiveChatController` |
| Aggregation | `adaptiveResultAggregator` (five-turn aggregation — untouched) |
| Risk & caregiver | `riskAssessmentService` (repeated aggregate concern policy), `adaptiveRiskRepository`, `alertService` — **no rule changes** |
| Activities | `support_activities` catalog, `activityRecommendationService`, `cognitiveActivityScoringService`, `cognitiveDifficultyService`, self-selected library |
| Reminiscence | `reminiscenceSupportService` directives, `ReminiscenceActivityScreen` |
| Trends | `wellnessTrendService` / `wellnessTrendController` |
| Frontend | Premium wellness design system (`theme.js`, `WellnessUI.js`), custom stack navigator |

## B. Voice-first changes

- Home primary action is now **"Talk With Me" → Start Conversation** (questionnaire wording removed).
- Conversation screen auto-reads each question aloud (existing TTS) with a prominent **Listen** control.
- **Speak Answer** is the visually dominant action (full-width, 96 dp min-height microphone button).
- The microphone **never starts automatically**; listening begins only on an explicit tap.
- Transcript review is mandatory before submission (**"I heard:" → Use this answer / Try again**).
- Elder-friendly voice states only: *Ready to listen · Listening... · One moment... · I heard:*.
  No STT/confidence/engine wording is ever displayed.

## C. New Talk With Me flow

```
Home "Talk With Me"
→ startAdaptiveChat (unchanged contract)
→ question card (+ auto TTS, Listen control)
→ Speak Answer (user-initiated) → STT → transcript review → Continue
→ safe acknowledgement bubble ("You said:" + acknowledgement)
→ next adaptive question (fade-in)
→ exactly five turns → SupportResultScreen
```

Voice, Quick Reply, and typed answers all converge on the single guarded
`respondAdaptiveChat` path (enforced by `voiceUtils.test.cjs` and `quickReplyUX.test.cjs`).

## D. Micro-conversation acknowledgement design

New deterministic service: `backend/src/services/conversationAcknowledgementService.js`

- Input signals (safe only): answer polarity, interpreted emotional direction, explicitness flag,
  question dimension, turn number, previous acknowledgement text.
- Curated banks: neutral (*Thanks for sharing.* …), positive (*That sounds like a nice moment.* …),
  concern-oriented (*Thank you for sharing that.* …).
- Selection = category + turn number + previous text ⇒ deterministic, never repeats immediately.
- No LLM. Never diagnoses, promises, or claims to "understand exactly how you feel".
- Returned per turn as `acknowledgement` in the respond payload; persisted inside the turn's
  `analysis_metadata.acknowledgement` (additive JSONB field).

## E. Question-bank wording audit

All active assessment questions were audited against: target state, semantic direction, Quick
Replies, contextual interpretation metadata, assessment dimension, and selector behavior.

Full audit table (dimension/target/semantics unchanged everywhere):

| question_code | dimension | target_state | verdict | action |
|---|---|---|---|---|
| open_day_so_far | general_wellbeing | neutral | elder-friendly | keep |
| open_mind_today | general_wellbeing | neutral | acceptable free-text opener | keep |
| open_things_felt | general_wellbeing | neutral | elder-friendly | keep |
| lonely_quiet_house | social_connection | loneliness | elder-friendly | keep |
| lonely_spoke_someone | social_connection | loneliness | elder-friendly | keep |
| lonely_contact_helpful | positive_protective_factor | loneliness | too formal/long | **rewritten** |
| lonely_companionship | social_connection | loneliness | acceptable | keep |
| lonely_daily_engagement | daily_engagement | loneliness | double-clause | **rewritten** |
| sad_energy_today | energy_motivation | sadness | exemplar style | keep |
| sad_usual_interest | daily_engagement | sadness | elder-friendly | keep |
| sad_supportive_moment | positive_protective_factor | sadness | elder-friendly | keep |
| sad_daily_engagement | daily_engagement | sadness | elder-friendly | keep |
| anxious_worried_today | worry_calmness | anxiety | elder-friendly | keep |
| anxious_relax_today | worry_calmness | anxiety | QR mismatch ("times" vs "I did") | **QR fixed** |
| anxious_daily_tasks | daily_engagement | anxiety | elder-friendly | keep |
| anxious_supportive_factor | positive_protective_factor | anxiety | elder-friendly | keep |
| anger_frustrating_today | clarification | anger | elder-friendly | keep |
| anger_calm_period | worry_calmness | anger | elder-friendly | keep |
| anger_daily_engagement | daily_engagement | anger | elder-friendly | keep |
| anger_supportive_factor | positive_protective_factor | anger | long | **rewritten** |
| happy_special_memory | positive_protective_factor | happiness | elder-friendly | keep |
| happy_daily_engagement | daily_engagement | happiness | short | keep |
| happy_energy_today | energy_motivation | happiness | awkward phrasing | **rewritten** |
| happy_social_connection | social_connection | happiness | elder-friendly | keep |
| cognitive_concentration_today | memory_concentration | cognitive_fog | elder-friendly | keep |
| cognitive_daily_tasks | daily_engagement | cognitive_fog | elder-friendly | keep |
| cognitive_clear_period | positive_protective_factor | cognitive_fog | elder-friendly | keep |
| cognitive_engagement_today | memory_concentration | cognitive_fog | long | **rewritten** |
| neutral_usual_interest | daily_engagement | neutral | acceptable | keep |
| neutral_energy_today | energy_motivation | neutral | exemplar style | keep |
| neutral_positive_moment | positive_protective_factor | neutral | elder-friendly | keep |
| neutral_daily_engagement | daily_engagement | neutral | double clause | **rewritten** |
| sad_share_difficult / angry…(clarification) | clarification | — | intentional share prompts | keep |

## F. Number of questions rewritten

**6 question texts rewritten**, **4 Quick-Reply sets added/fixed**
(migration `1748650000000_component4_elder_friendly_wording.js`; fully reversible down-migration
restores original texts/replies). All other questions kept their proven wording.

## G. Quick Reply compatibility

- Every updated set keeps exactly three balanced options (affirming / middle / declining).
- Replies were re-aligned to their question grammar (e.g., *"Were there any times…"* now pairs with
  *"Yes, there were"* instead of *"Yes, I did"*).
- New sets added where questions previously lacked them:
  `lonely_daily_engagement`, `happy_energy_today`, `cognitive_engagement_today`.
- Contextual interpretation metadata untouched; quick-reply values remain plain strings consumed by
  the same NLP pipeline.

## H. Primary + alternative recommendation logic

`activityRecommendationService.recommendActivity` now returns:

- `recommendation` — highest-scoring **safety-eligible** activity (unchanged semantics),
- `alternative_recommendation` — next-best eligible candidate, preferring a different activity
  family, from the same eligibility set (so it always satisfies risk/difficulty constraints),
  `null` when only one option exists (graceful degradation).

Eligibility gate (`isEligible`) runs **before** scoring: emotion-category match, easy-only under
high risk / anxiety / anger / cognitive fog / limited engagement, fog-preferred families.

## I. Preference-learning architecture

New deterministic service: `backend/src/services/activityPreferenceService.js`

- Profile derived from existing `adaptive_activity_attempts` history (no new ML model):
  per activity family → `selfSelectedCount`, `recommendedStartedCount`, `completionCount`,
  `lastUsedAt`.
- Wired into the chat controller via `getRecentActivityAttemptHistory` (new repository function);
  recent-variety penalties now consider both recommended AND self-selected history.

## J. Preference scoring values actually used

| Rule | Value |
|---|---|
| Voluntary self-selection bonus | +2 per distinct family start (max 3 counted) |
| Completion bonus | +1 per completion (max 3 counted) |
| Hard cap on total preference bonus | **+8** |
| Very-recent-use window | 48 h (flags repetition-penalty layer) |
| Structural weights (unchanged) | emotion fit 40 · risk 20 · engagement 15 · variety 10 · difficulty 10 · immediate repeat −15 · risk mismatch −30 |

Accuracy alone is never a preference signal; response time is never interpreted as dislike.

## K. Safety precedence proof

1. Preference bonus (≤ +8) < smallest structural weight (difficulty fit = 10) ⇒ preference can only
   break ties between equally safe candidates.
2. Bonus is applied strictly **inside** the eligibility-filtered candidate set; ineligible activities
   never reach scoring (`isEligible` unit-tested).
3. High-risk/easy restriction tested: a heavily preferred Medium family cannot be selected under
   high risk (`preference NEVER overrides safety` test), and both slots stay Easy-compatible.
4. Caregiver alert rules untouched — alerts derive only from repeated aggregate emotional concerns.

## L. Personalized reminiscence architecture

- `reminiscenceMemoryService.js`: deterministic keyword-based topic derivation over 10 everyday
  topic types (garden, music, cooking, pet, travel, celebration, family, work, place, hobby);
  curated prompt templates per type; generic fallback prompts.
- `reminiscenceMemoryRepository.js`: CRUD + least-recently-used topic selection with usage marking.
- `reminiscenceMemoryController.js` + routes:
  - `POST /reminiscence-topics/preview` (derive only — nothing stored)
  - `POST /reminiscence-topics` (consent-gated save)
  - `GET /reminiscence-topics/:userId`
  - `DELETE /reminiscence-topics/:topicId`, `DELETE /reminiscence-topics/user/:userId`
  - `GET /reminiscence-prompt/:userId` (personalized or generic; marks topic used)
- Frontend: `ReminiscenceHubScreen` → `MemoryMomentScreen` (prompt + voice/text sharing + consent),
  `RememberedTopicsScreen` (view/remove/clear), `PhotoMemoryScreen`.

## M. Consent mechanism

- Explicit UI consent step after sharing: *"Would you like ElderMeds to remember this topic for
  future memory activities?"* → **[Yes, remember this] [Not now]**. Non-manipulative wording.
- Server-side hard gate: save requests without `consent === true` are rejected with HTTP 403.
- DB constraint: `consent_status = FALSE OR consent_recorded_at IS NOT NULL` — a stored topic can
  never lack a recorded consent timestamp.
- Participation in an activity never implies consent.

## N. Remembered-topic data model

`reminiscence_user_topics` (migration `1748640000000_component4_reminiscence_user_topics.js`):

```
id UUID PK · user_id FK(users) · topic_type VARCHAR(50) · topic_label VARCHAR(80)
safe_detail VARCHAR(120) · source_activity_id VARCHAR(80)
consent_status BOOLEAN · consent_recorded_at TIMESTAMPTZ
is_active BOOLEAN · last_used_at TIMESTAMPTZ · created_at/updated_at TIMESTAMPTZ
```

Indexes: `(user_id, is_active, created_at DESC)` and partial `(user_id, last_used_at NULLS FIRST)
WHERE is_active`. **Stored:** structured topic metadata only. **Never stored:** full transcripts,
passwords, financial data, medical information, photos, or biometric data.

## O. Topic deletion / privacy behavior

- Remove one topic / clear all = soft delete (`is_active = FALSE`), reversible at the data layer,
  scoped by `user_id`.
- Deleted topics are excluded from listing and prompt selection immediately (tested).
- The UI states plainly what is kept ("Only small topic labels are kept here — never your full
  words, photos, or private details.").

## P. Photo-assisted reminiscence implementation

- `PhotoMemoryScreen` uses `expo-image-picker` with explicit user action (**Choose a Photo**),
  single selection, no gallery scanning, no upload endpoint.
- Flow: photo shown as cue → *"Would you like to tell me something you remember about this photo?"*
  → voice/type memory → optional consent step storing topic metadata only
  (`source_activity_id = 'photo_reminiscence'`).
- Photo URI lives in component state only; cleared on unmount; never transmitted; removable anytime.

## Q. Proof no facial recognition exists

- No face/vision ML dependency anywhere in the feature (frontend deps: picker/speech only).
- Static contract tests forbid facial-recognition/identity-inference patterns in the screen source
  (`photoReminiscence.test.cjs`).
- The backend receives no image bytes whatsoever — only optional consented topic text metadata.

## R. Today for You Home redesign

Four-choice mental model with visual identities per spec:

| Card | Identity | Destination |
|---|---|---|
| Talk With Me (hero) | teal/mint, microphone glyph, "5 short moments · Voice supported · About 3 minutes" | AdaptiveSupportChatScreen |
| Play an Activity | lavender | CognitiveActivityLibraryScreen |
| Remember Something Nice | warm peach | ReminiscenceHubScreen |
| My Wellness | mint/sky, trend icon | EmotionalTrendScreen |

Plus a compact **Your Week** factual summary card (check-ins / activities / different ones tried)
with the empty state *"Your wellness journey will appear here as you use the app."*

## S. Gentle engagement tracking

- Factual counts only: check-ins, completed activities, distinct activity families tried,
  reminiscence completions.
- Explicitly absent: streaks, ranks, leaderboards, levels, badges, missed-day guilt, peer
  comparison, combined wellness scores (enforced by static tests).

## T. Wellness Trends changes

Minimal extension of `EmotionalTrendScreen`: third metric card **"Different ones tried"** and an
optional **"Memory moments this period"** card fed by existing
`activities.reminiscence.completed_count`. No new backend aggregates, no invented scores.

## U. Voice / text / Quick Reply convergence

All three input paths populate the same editable `currentAnswer` and submit through the single
guarded `respondAdaptiveChat` call (`submissionLockRef` prevents doubles). Verified by pre-existing
contracts (`quickReplyUX.test.cjs`, `voiceUtils.test.cjs`) plus new flow tests.

## V. Regression test results

Backend (`npx jest`): **21 suites / 222 tests passing** — includes 178 pre-existing tests
(all still green) plus new suites:
`conversationAcknowledgementService`, `activityPreferenceService`,
`activityRecommendationAlternatives`, `reminiscenceMemoryService`,
`elderFriendlyWordingMigration` (static migration contract).

Frontend (`npx jest`): contract suites covering Home IA, voice-first conversation rules,
two-option result, reminiscence hub/consent, photo safety, backend consent gate, plus all
pre-existing suites (`cognitiveActivityLibrary`, `personalization`, `quickReplyUX`, `voiceUtils`).

## W. Caregiver-policy regression

- `riskAssessmentService`, `adaptiveRiskRepository`, `alertService`, and both alert creation paths
  are byte-for-byte unchanged.
- Recommendation/preference changes cannot trigger alerts: they run after aggregation and touch no
  alert code paths.
- No caregiver alerts derive from preference, topics, photos, accuracy, response time, difficulty,
  or engagement counts.

## X. Database migrations

| Migration | Type | Reversibility |
|---|---|---|
| `1748640000000_component4_reminiscence_user_topics.js` | additive table + indexes | `down` drops indexes/table |
| `1748650000000_component4_elder_friendly_wording.js` | UPDATE question_text/quick_replies only | `down` restores exact originals |

No historical emotion results, sessions, turns, or alert rows are modified.

## Y. Files changed / new

**Backend — new:** `services/conversationAcknowledgementService.js`, `services/activityPreferenceService.js`,
`services/reminiscenceMemoryService.js`, `repositories/reminiscenceMemoryRepository.js`,
`controllers/reminiscenceMemoryController.js`,
migrations ×2, tests ×5.
**Backend — modified:** `services/activityRecommendationService.js` (primary+alternative+preference),
`repositories/activityRecommendationRepository.js` (+attempt history fn),
`controllers/adaptiveChatController.js` (acknowledgement, alternative, preference wiring),
`routes/emotionalSupportRoutes.js` (+6 routes).
**Frontend — new:** `screens/ReminiscenceHubScreen.js`, `screens/MemoryMomentScreen.js`,
`screens/PhotoMemoryScreen.js`, `screens/RememberedTopicsScreen.js`, contract tests ×5.
**Frontend — modified:** `screens/ElderHomeScreen.jsx` (Today for You),
`screens/AdaptiveSupportChatScreen.js` (conversation UI),
`screens/SupportResultScreen.js` (primary + alternative),
`screens/EmotionalTrendScreen.js` (gentle counts), `EmotionalSupportNavigator.jsx` (+4 routes),
`api/emotionalSupportApi.js` (+6 endpoints), `package.json` (jest testMatch).

## Z. Manual Android verification checklist

Run through on a device/emulator build (`eas build --profile development` or `expo run:android`):

1. **FLOW A (voice-first):** Home → Talk With Me → question read aloud → Listen replays → Speak
   Answer → "I heard:" review → Use this answer → Continue → acknowledgement appears → next
   question → exactly five dots fill → result screen.
2. **FLOW B (Quick Reply):** same session using Quick answers → identical backend interpretation.
3. **FLOW C (typed):** "or answer in your own words" → typed answer → identical pipeline.
4. Result shows Recommended for you + Another option (both launch correctly); Explore link opens
   the library.
5. Remember Something Nice → hub → Suggested prompt shares memory → consent Yes stores topic;
   Not now stores nothing; My Remembered Topics lists/removes/clears; deleted topic no longer used.
6. Remember with a Photo → Choose a Photo (system picker) → memory shared → consent → only topic
   saved; Remove photo works; leaving screen clears the reference.
7. Home greeting matches device time and first name; no card overlaps the Android status/navigation
   areas (SafeAreaView + insets respected).
8. Your Week shows real counts; fresh account sees the journey empty-state sentence.

*(Screenshots to be attached during device QA pass.)*

## AA. Git status

See `git status --short` at delivery time; all changes are uncommitted working-tree additions on
branch `main` of `R26-SE-028`, ready for review and commit.

---

### Research novelty breakdown (as implemented)

1. **Voice-first multimodal interaction** — speech-primary answering with mandatory transcript
   confirmation and full accessibility fallbacks.
2. **Context-aware NLP interpretation** — MiniLM v4 + LR with polarity, branch codes, and explicit
   evidence weighting (pre-existing, preserved).
3. **Five-turn adaptive conversation** — deterministic selector with dimension diversity and
   cross-session diversity (preserved).
4. **Longitudinal emotional context** — 7-day history informs targeting and repetition policy
   (preserved).
5. **Explainable activity recommendation** — per-candidate fit metadata (emotion/safety/engagement/
   difficulty/variety/repetition) retained internally, never shown to elders.
6. **Preference-aware personalization** — capped deterministic bonuses from voluntary selection and
   completion history; safety precedence proven by tests.
7. **Adaptive cognitive engagement** — Easy/Medium difficulty routing preserved end-to-end.
8. **Consent-based personalized reminiscence** — opt-in structured topics with curated templates and
   LRU rotation.
9. **Photo-assisted reminiscence without facial recognition** — user-selected cue images, zero
   analysis, zero retention.
10. **Non-clinical wellness trend visualization** — factual engagement counts only.

No claims of clinical diagnosis, dementia screening, or cognitive scoring are made anywhere in the
product or this document.