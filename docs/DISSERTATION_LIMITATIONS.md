# Dissertation — Limitations & Future Work

Ready-to-adapt paragraphs for the **Limitations** and **Future Work** sections of your methodology / evaluation chapters.

**Production alignment (August 2026):** Final hybrid defaults **α=0.5, β=0.5, Warning=15, Dangerous=50**; three algorithms in `compare_models.py`; FAERS training n ≈ 11,868.

---

## 1. Confusion Matrices

Binary and hybrid 3-class confusion matrices are generated from the production XGBoost model on the 20% stratified hold-out set.

**Generate (terminal output is screenshot-ready):**
```powershell
cd backend
npm run ml:confusion-matrices
```

**Artifact:** `backend/ml/models/confusion_matrices.json`

**Dissertation text:**
> Model performance was evaluated on a held-out 20% stratified test set (n = 2,374). Table X reports the binary confusion matrix for severe ADR classification (adr_event). Table Y reports the hybrid 3-class confusion matrix, where ground truth labels were derived from the evaluation-only `risk_label_eval` column and predictions used the final runtime hybrid formula (0.5 × ruleScore + 0.5 × mlDangerScore) with thresholds **15/50**.

---

## 2. Warning Class Imbalance (~8%)

**Facts (full dataset, n = 11,868):**
| Class | Rows | Share |
|-------|------|-------|
| Dangerous | 6,203 | 52.3% |
| Safe | 4,728 | 39.8% |
| Warning | 937 | **7.9%** |

Warning cases were derived post-hoc as non-severe FAERS reports with a DDInter co-administration signal (`adr_event = 0` AND `ddi_flag = 1`). This reflects pharmacovigilance practice — explicit “moderate risk” labels are rarely recorded in FAERS — but it introduces class imbalance for 3-class evaluation.

**Dissertation text:**
> The Warning class comprises 937 rows (7.9% of the corpus), derived as a post-hoc proxy rather than a native FAERS label. This imbalance limits the statistical power of 3-class evaluation metrics and should be interpreted with caution. The binary ML target (severe ADR vs non-severe) is unaffected, as Warning labels are used for evaluation and hybrid threshold calibration only, not for classifier training.

---

## 3. Hybrid F1 (~0.70) vs Binary F1 (~0.94) — Why the Drop Is Expected

| Metric | What it measures | Typical F1 |
|--------|------------------|------------|
| Binary F1 | XGBoost: severe ADR vs non-severe | ~0.93–0.94 |
| Hybrid 3-class F1 | Rule + ML blend → Safe/Warning/Dangerous | ~0.70 |

**Dissertation text:**
> The apparent gap between binary F1 (0.94) and hybrid 3-class F1 (0.70) is expected and does not indicate ML underperformance. Binary F1 evaluates the classifier on its training target (adr_event). Hybrid 3-class F1 evaluates a separate pipeline: rule-engine scores blended with ML probabilities and discretised through clinical thresholds. Degradation arises from three defensible sources: (1) Warning is a sparse proxy class (~8%); (2) offline rule-score estimation from FAERS features approximates, but does not replicate, the live P1–P16 rule engine; and (3) Safe↔Warning boundary errors affect 3-class F1 without implying missed severe ADR detection — the primary safety objective. The final deployed runtime setting is **0.5/0.5 + 15/50**, while offline threshold-search artifacts should be interpreted as calibration support rather than full end-to-end clinical validation.

---

## 4. DDI Relabeling and Warning Proxy Labels (Not Clinician Ground Truth)

**Dissertation text (Limitations):**
> Three-level evaluation labels (`risk_label_eval`) were derived using a transparent rule: severe FAERS reports map to Dangerous; non-severe reports with DDInter interaction signals map to Warning; remaining non-severe reports map to Safe. This derivation is methodologically honest — it uses only FAERS and DDInter fields — but it is a **proxy**, not clinician-validated ground truth. FAERS does not record Safe/Warning/Dangerous tiers natively.

**Dissertation text (Section 12 — Future validation, copy-ready):**
> Warning labels were proxy-labelled using a DDInter co-administration signal on non-severe FAERS reports. Within the scope of this dissertation, **50 real prescription vignettes** (stratified across Safe, Warning, and Dangerous proxy bands) will be reviewed independently by **two licensed pharmacists**, with disagreement resolved by discussion, to assess whether the proxy Warning tier aligns with professional judgement. This pharmacist review is scheduled as immediate post-submission validation (Section 12) and does not inflate claims in the automated evaluation chapter.

---

## 5. Usability and Clinical Validation

**Dissertation text (if SUS not yet run):**
> Technical performance was evaluated on FAERS hold-out data and a three-algorithm comparison (Random Forest, XGBoost, Logistic Regression). System Usability Scale (SUS) testing with elderly participants and caregiver dyads was conducted according to the protocol in Appendix X (or: is reported in Section Y with n = …, mean SUS = …). No prospective clinical trial was conducted within the project scope.

**Dissertation text (if SUS completed):**
> Usability was assessed with the System Usability Scale (SUS) on [n] participants ([elderly/caregiver mix]). Mean SUS was [mean] (SD [sd]), compared against the ≥ 70 acceptability benchmark. Task completion for five standardized scenarios was [X]%.

**Suggested future work (bullet form):**
- Pharmacist review of Warning proxy labels (50 vignettes, 2 reviewers)
- Prospective pilot with de-identified local prescriptions
- External validation on a held-out FAERS time window (e.g. 2024 reports)
- Food–drug cross-reactivity extension beyond medicine-allergy text matching

---

## Quick Reference — npm Commands

| Command | Output |
|---------|--------|
| `npm run ml:confusion-matrices` | Binary + hybrid CM (JSON + terminal) |
| `npm run ml:compare` | **Three-algorithm** comparison table |
| `npm run ml:hybrid-ablation` | Weight ablation (Section 13.1) |
| `npm run ml:thresholds` | Threshold sensitivity artifact generation |

---

## Viva — If Asked About Gaps

> "We were transparent about proxy labels and class imbalance. The ML model is validated on binary severe ADR — the safety-critical endpoint. Three-class output is a runtime clinical decision supported by rules and the final deployed configuration α=0.5, β=0.5, Warning=15, Dangerous=50, not a trained classifier. Usability was assessed with SUS on [n] elderly users and caregivers [or: pharmacist validation of 50 vignettes is planned in Section 12]. Documentation and production artifacts were aligned in August 2026."
