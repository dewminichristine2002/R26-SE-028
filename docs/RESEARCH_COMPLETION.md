# RTAD-MSM Research Completion Tracker

See **[OBJECTIVES_EVIDENCE.md](OBJECTIVES_EVIDENCE.md)** for the full audit with file paths and metrics.

## Objectives status (latest)

| # | Objective | Status |
|---|-----------|--------|
| **O1** | Data pipeline | ✅ **Complete** (barcode excluded) |
| **O2** | Knowledge bases (RxNorm, SIDER, DDInter, WHO ATC) | ✅ **Complete** |
| **O3** | Rule engine | ✅ **Complete** |
| **O4** | ML + baselines | ✅ **Complete** |
| **O5** | Hybrid scoring | ✅ **Complete** |
| **O6** | System evaluation | 🟡 **Technical complete** — SUS study pending |
| **O7** | Continuous learning | ✅ **Complete** |

## Run all evaluations

```powershell
cd backend
npm run ml:evaluate-all
```

## Only you can finish O6 fully

Run the usability study:

1. [SUS_STUDY_PROTOCOL.md](SUS_STUDY_PROTOCOL.md) — elderly/caregiver protocol (target n = 10–15; minimum n = 8)
2. [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md) — 10 SUS items + scenarios
3. [SUS_RESULTS_SHEET.md](SUS_RESULTS_SHEET.md) — per-participant log (keep local; do not commit PII)

**Target:** mean SUS ≥ 70; task completion ≥ 80%.

**Documentation aligned August 2026:** [OBJECTIVES_EVIDENCE.md](OBJECTIVES_EVIDENCE.md) now lists **3 algorithms** and the final hybrid operating configuration **α=0.6, β=0.4, Warning=34, Dangerous=36** (matches production code).
