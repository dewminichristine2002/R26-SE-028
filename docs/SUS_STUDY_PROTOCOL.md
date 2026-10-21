# SUS Usability Study Protocol — Objective 6 (O6)

**Purpose:** Close the human-factors gap for ElderMeds before viva.  
**Instrument:** System Usability Scale (SUS), 10 items, score 0–100.  
**Target score:** **≥ 70** (industry benchmark for “acceptable” usability).

---

## Participants

| Criterion | Detail |
|-----------|--------|
| **Target n** | **10–15** (elderly adults and/or family caregivers) |
| **Minimum defensible n** | **8** if recruitment is difficult — report limitation in dissertation |
| **Age** | Primary users ≥ 60; caregivers ≥ 18 assisting an older adult |
| **Inclusion** | Able to use a smartphone; willing to complete 5 short tasks |
| **Exclusion** | Developers who built the app; no informed consent |

---

## Ethics and consent

- Brief verbal/written explanation: app is **research prototype**, not medical advice.
- Participant may stop at any time.
- Do **not** collect names in scored sheets — use IDs (P01, P02, …).
- Store raw sheets locally; **do not commit** identifiable data to git.

---

## Session flow (≈ 30–40 minutes per participant)

1. **Intro (5 min)** — Purpose, not a diagnosis tool, think-aloud optional.
2. **App setup** — Install dev build or use researcher device; login/demo account.
3. **Profile (5 min)** — Enter sample allergies/conditions from scenario card (researcher provides).
4. **Five tasks (15–20 min)** — One medicine check per scenario (see [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md)).
5. **SUS questionnaire (5 min)** — 10 items on paper or Google Form.
6. **Optional debrief (5 min)** — Trust, readability, “Read aloud” button.

---

## Task success criteria

| Metric | Pass criterion |
|--------|----------------|
| **Task completion** | Participant reaches a **result screen** (Safe/Warning/Dangerous) for the scenario |
| **Study pass rate** | ≥ **80%** of tasks completed across all participants (aggregate) |
| **SUS** | Mean SUS ≥ **70** (or report mean ± SD with n) |

Record per task: Y/N completed, time (seconds), risk level shown.

---

## Scenarios (use printed cards)

| # | Profile summary | Medicine to check | Expected band |
|---|-----------------|-------------------|---------------|
| 1 | Age 72; **penicillin allergy** | Amoxicillin | Dangerous |
| 2 | Age 68; on **warfarin**; hypertension | Ibuprofen | Warning / Dangerous |
| 3 | Age 65; no allergies; takes metformin | Paracetamol / Panadol | Safe / Warning |
| 4 | Age 45 caregiver; mother 78, diabetes | Metformin (for mother’s profile) | Context-dependent |
| 5 | Age 70; **aspirin allergy** in profile | Naproxen | Dangerous |

Adjust profiles in the app before each scenario or use pre-seeded demo accounts.

---

## SUS scoring (per participant)

**Positive items (1, 3, 5, 7, 9):** contribution = response − 1  
**Negative items (2, 4, 6, 8, 10):** contribution = 5 − response  

**SUS = (sum of contributions) × 2.5** → range 0–100.

---

## Results recording

Copy [SUS_RESULTS_SHEET.md](SUS_RESULTS_SHEET.md) or use this summary table in your dissertation appendix:

| ID | Role (elder/caregiver) | Age | Tasks pass (/5) | Avg time (s) | SUS |
|----|------------------------|-----|-----------------|--------------|-----|
| P01 | | | | | |
| P02 | | | | | |

**Aggregate for dissertation:**

- n = …
- Mean SUS = … (SD = …)
- Task completion rate = …%
- One qualitative quote (optional)

After data collection, update [RESEARCH_COMPLETION.md](RESEARCH_COMPLETION.md) O6 row to ✅ and paste summary into dissertation Chapter Evaluation.

---

## Viva one-liner

> “Technical evaluation used FAERS hold-out metrics and three-algorithm comparison. Usability was assessed with the System Usability Scale on [n] elderly users and caregivers; mean SUS was [X], meeting the ≥ 70 acceptability benchmark.”
