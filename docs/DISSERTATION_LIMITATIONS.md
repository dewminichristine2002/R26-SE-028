# Dissertation — Limitations & Future Work

Ready-to-adapt paragraphs for the **Limitations** and **Future Work** sections of your methodology / evaluation chapters.

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
> Model performance was evaluated on a held-out 20% stratified test set (n = 2,374). Table X reports the binary confusion matrix for severe ADR classification (adr_event). Table Y reports the hybrid 3-class confusion matrix, where ground truth labels were derived from the evaluation-only `risk_label_eval` column and predictions used the production hybrid formula (0.6 × ruleScore + 0.4 × mlDangerScore) with thresholds 25/60.

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

## 3. Hybrid F1 (0.70) vs Binary F1 (0.94) — Why the Drop Is Expected

| Metric | What it measures | Typical F1 |
|--------|------------------|------------|
| Binary F1 | XGBoost: severe ADR vs non-severe | ~0.93–0.94 |
| Hybrid 3-class F1 | Rule + ML blend → Safe/Warning/Dangerous | ~0.70 |

**Dissertation text:**
> The apparent gap between binary F1 (0.94) and hybrid 3-class F1 (0.70) is expected and does not indicate ML underperformance. Binary F1 evaluates the classifier on its training target (adr_event). Hybrid 3-class F1 evaluates a separate pipeline: rule-engine scores blended with ML probabilities and discretised through clinical thresholds. Degradation arises from three defensible sources: (1) Warning is a sparse proxy class (~8%); (2) offline rule-score estimation from FAERS features approximates, but does not replicate, the live P1–P16 rule engine; and (3) Safe↔Warning boundary errors affect 3-class F1 without implying missed severe ADR detection — the primary safety objective. Dangerous-class recall under proposed thresholds remains above 99% (Section 13.2).

---

## 4. DDI Relabeling Is a Proxy, Not Ground Truth

**Dissertation text:**
> Three-level evaluation labels (`risk_label_eval`) were derived using a transparent rule: severe FAERS reports map to Dangerous; non-severe reports with DDInter interaction signals map to Warning; remaining non-severe reports map to Safe. This derivation is methodologically honest — it uses only FAERS and DDInter fields — but it is a proxy, not clinician-validated ground truth. FAERS does not record Safe/Warning/Dangerous tiers natively. Future work should validate proxy labels against pharmacist or geriatrician review of a stratified sample.

---

## 5. No User Study / Clinical Validation (Future Work)

**Dissertation text:**
> This study evaluates technical performance using automated metrics on a pharmacovigilance corpus and simulated hybrid scoring. No prospective clinical trial or geriatrician-in-the-loop validation was conducted within the project scope. System Usability Scale (SUS) evaluation with elderly participants and caregiver dyads is identified as essential future work before deployment. Similarly, hybrid threshold calibration (25/60) should be reviewed with a clinical advisory panel using real patient vignettes.

**Suggested future work list (bullet form):**
- SUS usability study with target users (n ≥ 12)
- Pharmacist/clinician review of Warning proxy labels (n ≥ 50 stratified cases)
- Prospective pilot with de-identified real prescriptions
- External validation on a held-out FAERS time window (e.g. 2024 reports)

---

## Quick Reference — npm Commands

| Command | Output |
|---------|--------|
| `npm run ml:confusion-matrices` | Binary + hybrid CM (JSON + terminal) |
| `npm run ml:compare` | Algorithm comparison table |
| `npm run ml:hybrid-ablation` | Weight ablation (Section 13.1) |
| `npm run ml:thresholds` | Threshold sensitivity (Section 13.2) |

---

## Viva — If Asked About Gaps

> "We were transparent about proxy labels and class imbalance. The ML model is validated on binary severe ADR — the safety-critical endpoint. Three-class output is a runtime clinical decision supported by rules and thresholds, not a trained classifier. User validation is planned future work, which is standard for MSc research prototypes."
