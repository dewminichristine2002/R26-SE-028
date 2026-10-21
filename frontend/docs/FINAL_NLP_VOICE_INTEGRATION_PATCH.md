# Final NLP Voice Integration Patch

Date: 2026-08-24  
Scope: English STT + existing MiniLM v4 text NLP + adaptive interaction + device TTS. This is not Stage 11.

## A–C. Existing architecture and reused technology

The other ElderMeds components already use `expo-speech-recognition` with `en-US` for STT and `expo-speech` for TTS. Existing implementations were inspected in Medicine Safety, Assistant Chat, Routine Setup, and Schedule Board. This patch reuses the same optional native-module accessors in `src/utils/optionalExpoModules.js` and adds a shared emotional-support hook/control instead of introducing another provider.

STT is supplied by the device/OS recognition service. It is not Whisper and it does not send audio to the ElderMeds backend. Because recognition is configured with `requiresOnDeviceRecognition: false`, the OS/vendor may use a network recognition service depending on device configuration. TTS is generated through the device speech engine via Expo Speech.

## D. Final voice/NLP architecture

```text
English speech
  -> Expo/OS Speech-to-Text (en-US)
  -> editable English transcript
  -> existing /adaptive-chat/respond text endpoint
  -> MiniLM semantic embedding
  -> frozen Logistic Regression classifier v4
  -> existing confidence routing / deterministic rule fallback
  -> existing adaptive question selection
  -> text question
  -> Expo/device Text-to-Speech
  -> spoken question

Repeat for exactly five turns
  -> existing five-turn aggregation
  -> existing dynamic activity recommendation
  -> voice/touch activity interaction where semantically suitable
  -> existing server-owned activity result
  -> safe device-TTS completion feedback
```

This is language-content emotion classification after transcription. It is not acoustic voice-emotion recognition and performs no tone, pitch, prosody, speaker, stress, or biometric analysis.

## E–H. Adaptive Check-In behavior and MiniLM proof

- The microphone control has Idle (`Answer by Voice`), Listening, and Processing labels.
- A transcript populates the same editable `currentAnswer` used by typing. It is never auto-submitted.
- Send uses the single existing `respondAdaptiveChat` call and identical `answer_text` payload for typed and spoken input.
- A synchronous submission ref plus UI state prevents duplicate answer submission.
- Backend `question_number` remains authoritative and the existing five-turn/no-Q6 behavior is unchanged.
- Every genuinely new question is spoken once, keyed by question ID; React rerenders cannot replay it. A Listen/Stop control provides manual replay.
- Starting STT stops TTS before permission request and microphone activation. Screen cleanup stops/aborts both.

Controlled text-stage proof using the requested example (not hardcoded in production):

```text
Speech/transcript: "I haven't had anyone to talk to today."
MiniLM v4 result: loneliness, confidence 0.907381, source ml_model
Model version: minilm_logistic_regression_v4
Selector result: lonely_contact / social_connection / loneliness
```

Voice does not become a detection source. Stored emotion analysis remains `ml_model` or `rule_fallback`. No modality schema or database migration was added.

## I. Cognitive activity voice behavior

- Task prompts may be read aloud only when the answer phase is visible.
- Study items are not spoken by the shared recall-prompt behavior, preventing a later rerender from revealing them during recall.
- Touch choices remain available.
- A recognized answer maps only to an exact, case-insensitive, whitespace-normalized visible option. No fuzzy matching is used.
- Multi-recall accepts one exact visible choice at a time without removing touch access.
- The selected canonical option is sent through the unchanged activity submission endpoint. Correct answers remain server-owned and scoring remains server-side.
- Completion may speak `Activity completed` and the clearly named Activity Accuracy. It does not call it a cognitive/brain/memory health score.

Pattern/visual matching remains primarily touch based; voice is an optional exact-choice accessibility path, not a replacement.

## J–K. Reminiscence and calming behavior

Reminiscence speech populates the existing editable narrative field and uses the unchanged narrative completion payload. It does not score memory, and existing server tests continue to require accuracy/is_correct null.

Calming guidance uses only the predefined activity instructions or the local safe script: “Breathe in gently. Pause. Breathe out slowly.” Completion speaks only “Activity completed.” No LLM, diagnosis, treatment claim, or accuracy statement was added; existing calming accuracy remains null.

## L–N. Permissions, failures, and audio state

Existing configuration is reused:

- Android: `android.permission.RECORD_AUDIO`
- iOS: `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`
- Expo plugin: existing speech/microphone permission messages

Denied/unavailable permission, no speech, timeout, network/service failure, audio capture failure, and empty transcript all leave text/touch interaction available. User messages contain no stack trace. The shared state is one of `idle`, `speaking`, `listening`, or `processing`; speaking and listening are mutually exclusive.

The enforced start sequence is:

```text
await Speech.stop()
  -> request microphone/speech permission
  -> SpeechRecognition.start({ lang: 'en-US' })
```

This ordering is covered by an automated safety-policy test.

## O. Privacy and data handling

ElderMeds retains and sends the recognized transcript through existing text APIs. This patch does not record, upload to ElderMeds, or persist raw audio. Audio may be processed by the device OS/vendor speech service and may leave the device if that configured recognizer uses cloud processing. No stronger privacy claim is supported by the repository.

## P. Device/emulator verification

A physical microphone/speaker test could not be performed in this coding environment. Source parsing and automated policy tests passed. The local Expo Android production bundler was attempted, but it did not complete and was stopped after remaining silent; therefore this report does not claim a successful native bundle or physical audio verification.

Run these exact checks in a development build containing the speech-recognition native module:

1. Build/install with `npm run android` from `frontend` (Expo Go/stale clients may lack the native module).
2. Open Adaptive Check-In and confirm Question 1 of 5 is visible and spoken only once.
3. Trigger an unrelated rerender (focus/keyboard/edit) and confirm the question is not spoken again.
4. Tap Listen, then Answer by Voice; confirm playback stops before Listening appears and no overlap is audible.
5. Grant microphone/speech permission and speak an English answer.
6. Confirm Listening -> Processing -> Idle and the transcript appears in the answer field without submitting.
7. Edit the transcript, press Send Answer once, and confirm one next question and the correct question number.
8. Repeat through Question 5 and confirm completion with no Question 6 or duplicate messages.
9. Repeat after denying microphone permission; confirm the safe message and typed-answer path remain usable.
10. Test silence, airplane/network failure where applicable, and recognition-service unavailability; confirm retry/typing remains possible.
11. Leave each voice-enabled screen while speaking/listening; confirm audio/microphone stops.
12. On Support Result, confirm Listen speaks only safe completion/activity text—no confidence, model, risk, alert internals, or diagnosis.
13. In a cognitive task, confirm prompt playback does not reveal hidden recall content; speak an exact visible choice and verify server-returned scoring.
14. In reminiscence, verify editable speech transcription and completion without an accuracy result.
15. In calming support, verify scripted guidance and completion without accuracy or treatment claims.
16. Check large touch targets, safe area, scrolling, keyboard behavior, and no control overlap on the target phone/emulator.

## Q. Automated verification

- Voice utility/policy tests: **12/12 passed**.
  - English-only locale
  - minimal normalization
  - exact visible-option mapping
  - safe permission/no-speech/network errors
  - TTS-stop-before-STT ordering
  - immediate Listening state plus a 15-second recognition watchdog
  - installed native module `addListener` result/error event subscription
  - transcript-to-editable-field without auto-submit
  - one guarded typed/voice submit path
  - new-question-only automatic TTS
- Changed JavaScript/JSX files: **8/8 parsed successfully** with Babel parser.
- Python MiniLM v4 API/runtime: **8/8 passed**; response contract and v3 rollback unchanged.
- Component 4 backend: **13/13 suites, 104/104 tests passed**.
- Controlled example: MiniLM v4 returned the expected loneliness result and selector returned a social-connection follow-up.

Existing coverage confirms exactly five questions/no Q6, rule fallback, server-owned cognitive scoring, null reminiscence/calming accuracy, aggregation, routing/difficulty, trends, and unchanged three-same-concerns-within-seven-days caregiver policy.

## R. Other-component consistency

| Item | Same as other components? | Note |
|---|---|---|
| STT provider | YES | `expo-speech-recognition`, OS recognizer, `en-US` |
| TTS provider | YES | `expo-speech` / device TTS |
| Microphone visual pattern | YES | One large microphone button with listening status; styling matches Emotional Support’s senior UI |
| Permission approach | YES | Native module availability check followed by `requestPermissionsAsync` and safe text fallback |

The improvement is centralization: Emotional Support uses a shared hook/control, while older screens still contain their established local listener implementations. Adaptive Chat deliberately differs from Assistant Chat by not auto-submitting final speech, because emotional-support transcripts require user review.

## S–T. Files and dependencies

New:

- `src/features/emotionalSupport/voice/useEnglishVoice.js`
- `src/features/emotionalSupport/voice/voiceUtils.js`
- `src/features/emotionalSupport/voice/__tests__/voiceUtils.test.cjs`
- `src/features/emotionalSupport/components/VoiceControls.js`
- `docs/FINAL_NLP_VOICE_INTEGRATION_PATCH.md`

Modified:

- `AdaptiveSupportChatScreen.js`
- `SupportResultScreen.js`
- `CognitiveActivityScreen.js`
- `ReminiscenceActivityScreen.js`
- `CalmingActivityScreen.js`

Dependencies added: none. Existing `expo-speech` and `expo-speech-recognition` are reused. Existing Android/iOS/Expo permission configuration required no modification. Backend, Python ML, datasets, research artifacts, thresholds, labels, fallback, caregiver logic, and database schema were not changed by this voice patch.

## U. Git status boundary

Work was performed only on the current `Sandali2` working tree. No merge, commit, checkout, or push to another branch was performed. The repository also contains the earlier uncommitted Stage 4 research/deployment work; it remains intact and separate from the frontend files listed above.
