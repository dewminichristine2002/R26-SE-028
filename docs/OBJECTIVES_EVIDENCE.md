# Research Objectives — Completion Audit

**Project:** ElderMeds (RTAD-MSM)  
**Constraint:** No database schema changes  
**Audit date:** August 2026 — aligned with production artifacts in `backend/ml/models/` and `backend/src/config/hybridScoring.js`

> **Footnote:** This document was revised in **August 2026** to match the implemented system: **three** ML algorithms in `compare_models.py` (Random Forest, XGBoost, Logistic Regression), final hybrid defaults **α=0.6, β=0.4, Warning=34, Dangerous=36**, and **FAERS-first** training (`faers_adrs.csv`, n ≈ 11,868). Older references to five algorithms or prior calibration settings are obsolete.

---

## Summary

| Objective | Code complete | Evaluation complete | Human study needed |
|-----------|---------------|---------------------|-------------------|
| **O1** Data pipeline | ✅ Yes | 🟡 OCR accuracy test optional | No |
| **O2** Knowledge bases | ✅ Yes | ✅ Integrated in runtime | No |
| **O3** Rule engine | ✅ Yes | ✅ Auditable `riskFactors` | No |
| **O4** ML pipeline | ✅ Yes | ✅ `compare_models_results.json` | No |
| **O5** Hybrid scoring | ✅ Yes | ✅ `hybrid_weight_ablation.json`, `selected_hybrid_thresholds.json` | No |
| **O6** System evaluation | ✅ Technical | ✅ `baseline_metrics.json`, `compare_models_results.json` | **SUS study** |
| **O7** Continuous learning | ✅ Yes | ✅ `continuous_learning_simulation.json` | No |

**Verdict:** **6/7 objectives are complete in software + automated evaluation.**  
**O6** requires a **SUS usability study** with elderly users and/or caregivers — see [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md) and [SUS_STUDY_PROTOCOL.md](SUS_STUDY_PROTOCOL.md).

---

## O1 — Data Pipeline Design

**Requirement:** Prescription images, typed entries; OCR + NLP; normalize to drug databases.  
**Barcode:** Excluded by project scope.

| Component | Evidence |
|-----------|----------|
| Manual entry | `MedicineSafetyScreenFixed.js` |
| OCR | `prescriptionOcrService.js`, `POST /api/prescriptions/ocr` |
| Voice | Expo speech modules in `MedicineSafetyScreenFixed.js` |
| OCR post-correction | `ocrPostCorrection.js` |
| NLP normalization | `medicationKnowledgeService.js`, `drugNormalizationService.js` (RxNorm API) |
| Pipeline audit trail | `medicineInputPipeline.js` → `analysis.inputPipeline` |

**Dissertation note:** TF-IDF + fuzzy matching used instead of BioBERT/scispaCy (pragmatic deployment choice).

---

## O2 — Knowledge Base Integration

| KB | Evidence |
|----|----------|
| **RxNorm** | `resolveMedication`, `drugNormalizationService.js`, `rxnormCui` |
| **SIDER** | Side effects on drug records, `sideEffectMatchCount` |
| **DDInter** | `DDINTER_INTERACTIONS`, `findInteractions` |
| **WHO ATC** | `drug_class_dataset.json` (3523 drugs), `whoAtc` on `enrichMedication` |

**API output:** `medicationKnowledge.knowledgeSources` includes queried sources.

---

## O3 — Rule Engine Development

**File:** `allergyController.js` → `buildAnalysis`

| Rule category (proposal) | Implemented |
|--------------------------|-------------|
| Direct allergy match (+80) | ✅ `allergy_match` (P1) |
| ATC/class allergy (+65) | ✅ `allergy_class_match` (P2) |
| DDI severe/moderate | ✅ `ddinter_interaction` |
| Chronic contraindication | ✅ `chronic_condition` |
| Polypharmacy | ✅ `polypharmacy_risk` |
| Elderly risk | ✅ `elder_risk`, `elder_high_caution_medicine` |
| Pregnancy (+70) | ✅ `pregnancy_contraindication` |
| Hepatic/renal | ✅ `hepatic_impairment_risk`, `renal_impairment_risk` |
| Narrow therapeutic index (+15) | ✅ `narrow_therapeutic_index` |
| Audit trail | ✅ `riskFactors[]` + DB history |

---

## O4 — Machine Learning Pipeline

**Primary training data:** FAERS (`faers_adrs.csv`, **11,868 rows**, target `adr_event`).

**Algorithm comparison (Section 11.1):** exactly **three** models in `compare_models.py`:

| Algorithm | Hold-out F1 (weighted) | AUC-ROC | Severe ADR recall | Artifact |
|-----------|------------------------|---------|-------------------|----------|
| **XGBoost** | **0.934** | **0.984** | **95.3%** | `compare_models_results.json` |
| Random Forest | 0.932 | 0.974 | 93.8% | same |
| Logistic Regression | 0.654 | 0.713 | 62.9% | same |

**Production model:** Tuned XGBoost → `baseline_model.joblib` (see `baseline_metrics.json`, `baseline_model_metadata.json`).

| Item | Evidence |
|------|----------|
| 5-fold CV + SMOTE | `compare_models.py`, `train_production_model.py` |
| GridSearchCV (production) | `baseline_model_metadata.json` |
| 17 tabular features | `feature_schema.py` |

**Run:** `npm run ml:compare` then `npm run ml:train`

---

## O5 — Hybrid Scoring Architecture

| Item | Evidence |
|------|----------|
| Formula α=0.6, β=0.4 | `hybridScoring.js`, `applyMlPrediction` |
| **Production thresholds** | **Warning ≥ 34, Dangerous ≥ 36** (`hybridScoring.js`) |
| Final operating configuration | **α=0.6, β=0.4, T_C=34, T_D=36** |
| Ablation (rule/ML/hybrid) | `hybrid_weight_ablation.json` |
| Explainable breakdown | `dataUsed.hybridBreakdown` in API + app UI |

**Calibration summary:** A safety-oriented proxy calibration selected **0.6/0.4 + 34/36** as the final operating point. The reported proxy-calibration metrics for this setting are **Accuracy 81.55%**, **Macro F1 61.57%**, **Weighted F1 81.18%**, **Dangerous Precision 82.20%**, **Dangerous Recall 97.50%**, and **Dangerous FNR 2.50%**.

**Run:** `npm run ml:hybrid-ablation` and `npm run ml:thresholds`

---

## O6 — System Evaluation

### Automated (complete — cite FAERS artifacts)

| Metric | File | FAERS / production value |
|--------|------|-------------------------|
| Binary F1 (weighted) | `baseline_metrics.json` | **0.933** |
| ROC-AUC | `baseline_metrics.json` | **0.984** |
| Brier (calibration) | `baseline_metrics.json` | **0.048** |
| Algorithm comparison | `compare_models_results.json` | **3 algorithms** |
| Hybrid thresholds | `hybridScoring.js` | **34 / 36** |

**Run:** `npm run ml:evaluate-all`

> `system_evaluation.json` may reflect legacy mixed corpora — prefer **`baseline_metrics.json`** and **`compare_models_results.json`** for viva tables.

### Human study (required to close O6)

| Item | Status | Resource |
|------|--------|----------|
| SUS ≥ 70 (target) | ⬜ Pending | [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md) |
| SUS protocol (elderly/caregiver) | ⬜ Pending | [SUS_STUDY_PROTOCOL.md](SUS_STUDY_PROTOCOL.md) |
| Task completion ≥ 80% | ⬜ Record in study sheet | Same |

**Minimum defensible sample:** n ≥ **8** participants if recruitment is limited; target **10–15**.

---

## O7 — Continuous Learning Integration

| Item | Evidence |
|------|----------|
| Feedback logging | `POST /api/allergies/reactions`, `reaction_logs` |
| Check history for training | `medicine_check_history`, `ml/scripts/exportDataset.js` |
| Retrain pipeline | `retrain_pipeline.py` → `npm run ml:retrain` |
| Simulated deployment | `continuous_learning_simulation.json` |

**Run:** `npm run ml:simulate-learning`

---

## One-command evaluation bundle

From `backend/`:

```powershell
npm run ml:evaluate-all
```

Produces/updates JSON artifacts under `backend/ml/models/`.

---

## Honest limitations (state in dissertation)

1. **FAERS proxy labels** for Warning/Safe — not clinician-validated (see [DISSERTATION_LIMITATIONS.md](DISSERTATION_LIMITATIONS.md)).
2. **SUS** must be completed with elderly/caregiver participants before claiming full O6.
3. **Barcode** excluded; modalities: manual, OCR, voice.
4. **Hybrid proxy-calibration metrics** on the 3-class evaluation frame are not the same as binary severe-ADR metrics, even when the final deployed weights and thresholds are used.
