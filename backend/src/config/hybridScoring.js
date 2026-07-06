/**
 * Section 13 — Hybrid Risk Score Calculation.
 *
 * FinalScore = alpha * RuleScore + beta * (ML ADR probability * 100)
 *
 * Section 13.1 weight calibration (held-out test, three risk classes):
 *   rule-only 1.0/0.0 | ML-only 0.0/1.0 | proposed 0.6/0.4 | equal 0.5/0.5
 * See hybrid_weight_ablation.json (npm run ml:hybrid-ablation).
 */
const HYBRID_RULE_WEIGHT = Number(process.env.HYBRID_RULE_WEIGHT || 0.6);
const HYBRID_ML_WEIGHT = Number(process.env.HYBRID_ML_WEIGHT || 0.4);

/** Section 13.1 — ablation configurations evaluated on held-out test set. */
const WEIGHT_ABLATION_CONFIGURATIONS = Object.freeze([
  { name: 'rule_only', alpha: 1.0, beta: 0.0 },
  { name: 'ml_only', alpha: 0.0, beta: 1.0 },
  { name: 'hybrid_proposed', alpha: 0.6, beta: 0.4 },
  { name: 'hybrid_equal', alpha: 0.5, beta: 0.5 },
]);

/** Section 13.2 — auto-selected on FAERS hold-out: min FNR_D s.t. Precision_D ≥ 0.99 → 20/55. */
const THRESHOLD_SENSITIVITY_CONFIGS = Object.freeze([
  { configuration: 'delta_minus_10', warningMin: 15, dangerousMin: 50, delta: -10 },
  { configuration: 'delta_minus_5', warningMin: 20, dangerousMin: 55, delta: -5 },
  { configuration: 'legacy_proposed', warningMin: 25, dangerousMin: 60, delta: 0 },
  { configuration: 'delta_plus_5', warningMin: 30, dangerousMin: 65, delta: 5 },
  { configuration: 'delta_plus_10', warningMin: 35, dangerousMin: 70, delta: 10 },
]);

const RISK_THRESHOLDS = {
  warningMin: Number(process.env.RISK_THRESHOLD_WARNING || 20),
  dangerousMin: Number(process.env.RISK_THRESHOLD_DANGEROUS || 55),
};

const classifyRiskLevel = (score) => {
  if (score >= RISK_THRESHOLDS.dangerousMin) {
    return 'Dangerous';
  }
  if (score >= RISK_THRESHOLDS.warningMin) {
    return 'Warning';
  }
  return 'Safe';
};

const blendHybridScore = (ruleScore, mlDangerScore) => {
  const rule = Number(ruleScore || 0);
  const ml = Number(mlDangerScore || 0);
  const blended = Math.round(HYBRID_RULE_WEIGHT * rule + HYBRID_ML_WEIGHT * ml);

  return {
    ruleScore: rule,
    mlDangerScore: ml,
    blendedScore: blended,
    alpha: HYBRID_RULE_WEIGHT,
    beta: HYBRID_ML_WEIGHT,
    formula: `${HYBRID_RULE_WEIGHT} * ruleScore + ${HYBRID_ML_WEIGHT} * mlDangerScore`,
  };
};

module.exports = {
  HYBRID_RULE_WEIGHT,
  HYBRID_ML_WEIGHT,
  WEIGHT_ABLATION_CONFIGURATIONS,
  THRESHOLD_SENSITIVITY_CONFIGS,
  RISK_THRESHOLDS,
  classifyRiskLevel,
  blendHybridScore,
};
