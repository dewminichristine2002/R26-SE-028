# System Usability Scale (SUS) — Objective 6

Use this when running the **elderly user and caregiver usability study** (target **10–15** participants; minimum **8** defensible).  
Full protocol: [SUS_STUDY_PROTOCOL.md](SUS_STUDY_PROTOCOL.md). Results sheet: [SUS_RESULTS_SHEET.md](SUS_RESULTS_SHEET.md).

Technical metrics are generated automatically (`npm run ml:evaluate-all`); SUS requires human participants.

## Protocol

1. Five standardized patient–drug scenarios (see below).
2. Participant completes each scenario in the ElderMeds app.
3. Participant fills the SUS questionnaire (10 items, 1–5 Likert).
4. Optional 10-minute interview on trust and explainability.

## SUS items (standard)

Rate 1 = Strongly disagree … 5 = Strongly agree:

1. I think that I would like to use this system frequently.
2. I found the system unnecessarily complex.
3. I thought the system was easy to use.
4. I think that I would need the support of a technical person to use this system.
5. I found the various functions in this system were well integrated.
6. I thought there was too much inconsistency in this system.
7. I would imagine that most people would learn to use this system very quickly.
8. I found the system very cumbersome to use.
9. I felt very confident using the system.
10. I needed to learn a lot of things before I could get going with this system.

**Scoring:** For items **1, 3, 5, 7, 9**: score = response − 1. For items **2, 4, 6, 8, 10**: score = 5 − response. Sum × 2.5 = SUS (0–100). Target: **≥ 70**.

## Suggested scenarios

| # | Patient profile | Medicine to check | Expected band |
|---|-----------------|-------------------|---------------|
| 1 | Elderly, penicillin allergy | Amoxicillin | Dangerous |
| 2 | On warfarin + hypertension | Ibuprofen | Warning/Dangerous |
| 3 | No allergies, single metformin | Paracetamol | Safe |
| 4 | Pregnant, no high-risk meds on profile | Folic acid | Safe |
| 5 | NSAID allergy history | Naproxen | Dangerous |

Record: task completion (Y/N), time (seconds), final risk level shown, SUS score.

## Results template

| Participant | Scenario pass ( /5) | Avg time (s) | SUS score |
|-------------|-------------------|--------------|-----------|
| P01 | | | |
| … | | | |

Save completed sheets in your dissertation appendix (not committed to git if they contain personal data).
