# Final Cognitive Activity Bank + Senior-Friendly UI

## Research position

The feature provides short **cognitive engagement activities**. It is not a diagnostic test, dementia or Alzheimer's screening tool, MMSE, MoCA, or a medical cognitive assessment. Results are described only as activity accuracy, completion, time, and difficulty. Response time is retained as a raw interaction metric and is not interpreted clinically.

## Architecture

```text
Final emotion + risk + engagement + recent activity history
  -> deterministic dynamic activity router
  -> one of eight cognitive engagement types
  -> safety-constrained Easy or Medium difficulty
  -> server selects 3 (Easy) or 4 (Medium) curated items
  -> sanitized task snapshot (no answer keys)
  -> senior-friendly study/question UI
  -> optional TTS and supported STT, with touch always available
  -> one response path to server-side scoring
  -> activity accuracy + raw duration
  -> adaptive next-difficulty recommendation
  -> existing attempt persistence
  -> existing 7/30-day wellness trends
```

## Curated bank

The server bank contains five distinct items at each difficulty for each type: Word Category Match, Odd One Out, Word Completion, Pattern Sequence, Short Memory Recall, Orientation Activity, Simple Math & Counting, and Sequence Ordering. Total: 80 curated mini-items. No live or LLM-generated questions are used.

An Easy attempt contains three items. A Medium attempt contains four. The attempt `task_snapshot` holds the selected private items, while recursive sanitization removes `correctAnswer`, `correctAnswers`, and `correctOrder` from every nested item sent to the client. The client sends only item IDs, selected/ordered responses, and per-item response times; client-provided score fields are ignored.

Completed-attempt count provides a deterministic rotation offset. This changes the starting items and option ordering on consecutive attempts while remaining reproducible. Recommendation scoring separately penalizes recently used activity codes and types. Cognitive fog is limited to Easy orientation, word-category, simple-math, or short-recall activities.

## Scoring

- Single choice and exact sequence ordering: correct = 1, incorrect = 0.
- Recall item: `max(0, min(1, (correct selections - incorrect selections) / correct answer count))`.
- Attempt accuracy: arithmetic mean of its item scores, equivalent to `correct items / total items` when all items are binary.
- `is_correct` means every item received full credit. It is not a clinical classification.
- Response time does not affect accuracy or difficulty.

## Adaptive difficulty

Only Easy and Medium are supported. High risk, anxiety, anger, cognitive fog, or limited engagement always resolves to Easy. Medium accuracy below 0.50 returns to Easy. Moving from Easy to Medium requires current accuracy of at least 0.80, engaged status, an emotion/risk context that allows normal load, and two recent successful comparable Easy attempts. A single perfect attempt cannot bypass safety rules.

## Voice behavior

Voice answer is available for word category, odd one out (optional), word completion, short recall, orientation, and math. Pattern and ordering remain touch-preferred. Exact visible-label normalization is used—trim, case, and whitespace only—with no fuzzy inference. TTS stops before STT begins. On memory items, study playback speaks study words only while the study card is visible; recall playback speaks only the recall prompt and never replays the study list.

## Visual system

The screen uses a warm off-white background (`#F6F8F5`), white elevated cards, deep teal text, and restrained activity accents: lavender (`#7667B8`), slate sky (`#5578A6`), purple (`#8065A8`), sky blue (`#397CA5`), peach (`#B86B52`), mint teal (`#347B68`), warm gold (`#95701C`), and coral (`#A85E65`). It includes an introduction card, difficulty/question/time metadata, header/back action, progress bar, large answer cards, a dedicated memory study phase, pattern strip, non-drag ordering flow, optional voice controls, and a neutral completion metric grid.

## Persistence and compatibility

Migration `1748500000000_component4_cognitive_activity_bank.js` is additive and reversible. It adds/upserts the 16 Easy/Medium catalog entries and deactivates only the superseded pattern entry. It does not alter the attempt schema or historical attempt rows. Its down migration removes only new catalog rows, restores the prior three overwritten definitions/metadata, and reactivates the old pattern entry. Existing single-task snapshots remain scoreable through the legacy scoring path. Stage 8 reads the same attempt columns and now receives eight explicit activity types. No caregiver alert query, policy, or service was changed.
