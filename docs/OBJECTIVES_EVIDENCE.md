# Research Objectives — Completion Audit

**Project:** ElderMeds (RTAD-MSM)  
**Constraint:** No database schema changes  
**Audit date:** Generated with implementation artifacts below  

---

## Summary

| Objective | Code complete | Evaluation complete | Human study needed |
|-----------|---------------|---------------------|-------------------|
| **O1** Data pipeline | ✅ Yes | 🟡 OCR accuracy test optional | No |
| **O2** Knowledge bases | ✅ Yes | ✅ Integrated in runtime | No |
| **O3** Rule engine | ✅ Yes | ✅ Auditable `riskFactors` | No |
| **O4** ML pipeline | ✅ Yes | ✅ `compare_models_results.json` | No |
| **O5** Hybrid scoring | ✅ Yes | ✅ `hybrid_weight_ablation.json` | No |
| **O6** System evaluation | ✅ Technical | ✅ `system_evaluation.json` | **SUS study** |
| **O7** Continuous learning | ✅ Yes | ✅ `continuous_learning_simulation.json` | No |

**Verdict:** **6/7 objectives are 100% complete in software + automated evaluation.**  
**O6** requires you to run the SUS study with real participants (template provided).

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
| NLP normalization | `medicationKnowledgeService.js` fuzzy + RxNorm index |
| Pipeline audit trail | `medicineInputPipeline.js` → returned as `analysis.inputPipeline` |

**Dissertation note:** TF-IDF + fuzzy matching used instead of BioBERT/scispaCy (document as pragmatic deployment choice).

---

## O2 — Knowledge Base Integration

| KB | Evidence |
|----|----------|
| **RxNorm** | `medicationKnowledge.js`, `resolveMedication`, `rxnormCui` |
| **SIDER** | Side effects on drug records, `sideEffectMatchCount` |
| **DDInter** | `DDINTER_INTERACTIONS`, `findInteractions` |
| **WHO ATC** | `drug_class_dataset.json` (3523 drugs), `whoAtc` on `enrichMedication` |

**API output:** `medicationKnowledge.knowledgeSources` includes queried sources.

---

## O3 — Rule Engine Development

**File:** `allergyController.js` → `buildAnalysis`

| Rule category (proposal) | Implemented |
|--------------------------|-------------|
| Direct allergy match (+80) | ✅ `allergy_match` |
| ATC/class allergy (+65) | ✅ `allergy_class_match` |
| DDI severe/moderate | ✅ `ddinter_interaction` |
| Chronic contraindication | ✅ `chronic_condition` |
| Polypharmacy | ✅ `polypharmacy_risk` |
| Elderly risk | ✅ `elder_risk`, `elder_high_caution_medicine` |
| Pregnancy (+70) | ✅ `pregnancy_contraindication` |
| Hepatic/renal (+20) | ✅ `hepatic_impairment_risk`, `renal_impairment_risk` |
| Narrow therapeutic index (+15) | ✅ `narrow_therapeutic_index` |
| Audit trail | ✅ `riskFactors[]` + DB history |

---

## O4 — Machine Learning Pipeline

| Item | Evidence |
|------|----------|
| Random Forest (tuned) | `train_baseline.py`, `baseline_model.joblib` |
| Logistic Regression | `compare_models_results.json` |
| Decision Tree | same |
| Gradient Boosting | same |
| SVM (RBF) | same |
| 5-fold CV | `baseline_cv_metrics.json` |

**Run:** `npm run ml:compare`

---

## O5 — Hybrid Scoring Architecture

| Item | Evidence |
|------|----------|
| Formula α=0.6, β=0.4 | `hybridScoring.js`, `applyMlPrediction` |
| Thresholds 25 / 60 | `classifyRiskLevel` |
| Ablation (rule/ML/hybrid) | `hybrid_weight_ablation.json` |
| Threshold sensitivity | `threshold_sensitivity.json` |
| Explainable breakdown | `dataUsed.hybridBreakdown` in API + app UI |

**Key result:** Hybrid 0.6/0.4 F1 **0.986** vs rule-only **0.862** vs ML-only **0.547**.

**Run:** `npm run ml:hybrid-ablation` and `npm run ml:thresholds`

---

## O6 — System Evaluation

### Automated (complete)

| Metric | File | Example result |
|--------|------|----------------|
| Precision / Recall / F1 | `system_evaluation.json` | F1 macro 0.994 |
| ROC-AUC | `system_evaluation.json` | 1.000 OVR |
| Brier (calibration) | `system_evaluation.json` | 0.0016 (Dangerous) |
| Dangerous recall | `system_evaluation.json` | 0.993 |
| Baseline comparisons | `compare_models_results.json` | 5 models |

**Run:** `npm run ml:evaluate` or `npm run ml:evaluate-all`

### Human study (you must run)

| Item | Status | Resource |
|------|--------|----------|
| SUS ≥ 70 | ⬜ Pending participants | [SUS_QUESTIONNAIRE.md](SUS_QUESTIONNAIRE.md) |
| Task completion ≥ 80% | ⬜ Record in study sheet | Same doc |

---

## O7 — Continuous Learning Integration

| Item | Evidence |
|------|----------|
| Feedback logging | `POST /api/allergies/reactions`, `reaction_logs` table |
| Check history for training | `medicine_check_history`, `ml/scripts/exportDataset.js` |
| Retrain pipeline | `retrain_pipeline.py` → `npm run ml:retrain` |
| Simulated deployment | `continuous_learning_simulation.json` |

**Simulation result:** Retrain after simulated feedback: F1 0.930 on hold-out cycle 3 (see JSON for drift PSI).

**Run:** `npm run ml:simulate-learning`

---

## One-command evaluation bundle

From `backend/`:

```powershell
npm run ml:evaluate-all
```

Produces/updates all JSON artifacts under `backend/ml/models/`.

---

## Honest limitations (state in dissertation)

1. Training data mixes **real + synthetic** rows — high accuracy does not imply clinical validation.
2. **SUS** not run until you complete participant sessions.
3. **Barcode** intentionally excluded; three modalities: manual, OCR, voice.
4. Stack is **Node/Express + Python ML**, not FastAPI (document as implementation variant).
