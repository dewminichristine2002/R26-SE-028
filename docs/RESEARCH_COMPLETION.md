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

Run the usability study using [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md) (10–15 participants).
