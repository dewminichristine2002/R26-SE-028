const { hashUserId } = require('./feedbackAnonymizationService');
const { CLINICAL_RULES, RULE_BY_FACTOR_TYPE, P1_RULE } = require('../config/clinicalRules');

/**
 * Build a CLIPS-formalized risk factor with audit metadata (Section 12.1 / 12.3).
 */
const buildClinicalFactor = (ruleId, { factorLabel, severity, score, evidenceSource } = {}) => {
  const rule = CLINICAL_RULES[ruleId] || RULE_BY_FACTOR_TYPE[ruleId];
  if (!rule) {
    return {
      ruleId: ruleId || 'UNKNOWN',
      factorType: ruleId,
      factorLabel: factorLabel || '',
      severity: severity || 'medium',
      score: score || 0,
      evidenceSource: evidenceSource || 'SYSTEM',
    };
  }

  return {
    ruleId: rule.ruleId,
    priority: rule.priority,
    salience: rule.salience,
    factorType: rule.factorType,
    factorLabel: factorLabel || rule.name,
    severity: severity || rule.severity,
    score: score ?? rule.defaultScore,
    evidenceSource: evidenceSource || rule.evidenceSource,
    clipsRule: rule.clipsTemplate,
    shortCircuit: Boolean(rule.shortCircuit),
  };
};

/**
 * Section 12.3 — structured audit entry for regulatory / clinical review.
 */
const buildRuleAuditEntry = ({
  factor,
  anonymizedUserId,
  drugName,
  normalizedDrugName,
  timestamp = new Date().toISOString(),
}) => ({
  ruleId: factor.ruleId,
  priority: factor.priority,
  factorType: factor.factorType,
  anonymizedUserId,
  drug: drugName,
  normalizedDrug: normalizedDrugName,
  timestamp,
  ruleScore: factor.score,
  clinicalEvidenceSource: factor.evidenceSource,
  clipsRule: factor.clipsRule,
  factorLabel: factor.factorLabel,
});

const buildRuleAuditTrail = ({ riskFactors, anonymizedUserId, drugName, normalizedDrugName }) =>
  (riskFactors || []).map((factor) =>
    buildRuleAuditEntry({
      factor,
      anonymizedUserId,
      drugName,
      normalizedDrugName,
    })
  );

const anonymizeUserIdForAudit = (userId) => {
  if (userId == null || userId === '') {
    return 'anonymous';
  }
  return hashUserId(userId);
};

/**
 * Section 12.2 — P1 direct allergy short-circuit forces Dangerous regardless of ML.
 */
const applyP1ShortCircuit = ({ ruleScore, riskLevel }) => ({
  p1ShortCircuited: true,
  ruleScore: Math.max(ruleScore, 85),
  riskLevel: 'Dangerous',
  shortCircuitReason: P1_RULE.recommendation,
});

const shouldBlockMlDowngrade = (analysisPayload) =>
  Boolean(
    analysisPayload?.dataUsed?.p1ShortCircuited ||
      (analysisPayload?.riskFactors || []).some((f) => f.ruleId === 'P1' || f.factorType === 'allergy_match')
  );

/**
 * Section 13 — AllergyCrossReactivityRule severity scaling (dissertation formalization).
 *
 * score = baseScore * severity_multiplier[max_allergy_severity]
 */
const ALLERGY_LEVELS = Object.freeze(['mild', 'moderate', 'severe', 'anaphylactic']);

const ALLERGY_SEVERITY_MULTIPLIERS = Object.freeze({
  mild: 0.5,
  moderate: 0.75,
  severe: 1.0,
  anaphylactic: 1.25,
});

const normalizeAllergyLevel = (value) => {
  const level = String(value || '')
    .trim()
    .toLowerCase();
  return ALLERGY_LEVELS.includes(level) ? level : null;
};

const resolveMaxAllergySeverity = ({
  profile,
  payload,
  questionnaireText = '',
  severeReactionSignal = false,
} = {}) => {
  const severityField = normalizeAllergyLevel(payload?.severity);
  const combinedText = [
    profile?.knownAllergiesText,
    questionnaireText,
    payload?.notes,
    payload?.symptomMatch,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (
    severityField === 'anaphylactic' ||
    ['anaphylaxis', 'anaphylactic', 'collapse', 'cardiac arrest'].some((term) => combinedText.includes(term))
  ) {
    return 'anaphylactic';
  }

  if (severityField === 'severe' || severeReactionSignal) {
    return 'severe';
  }

  if (severityField === 'moderate' || payload?.hadReactionBefore === true) {
    return 'moderate';
  }

  if (profile?.hasMedicineAllergy === true || severityField === 'mild') {
    return profile?.hasMedicineAllergy === true ? 'moderate' : 'mild';
  }

  return 'mild';
};

const scoreAllergyCrossReactivityRule = (baseScore, maxAllergySeverity) => {
  const level = normalizeAllergyLevel(maxAllergySeverity) || 'moderate';
  const multiplier = ALLERGY_SEVERITY_MULTIPLIERS[level];
  return Math.round(Number(baseScore || 0) * multiplier);
};

/**
 * Section 12.3 — emit structured audit log for each triggered rule (regulatory / clinical review).
 */
const logClinicalRuleAudit = (ruleAuditTrail) => {
  if (!Array.isArray(ruleAuditTrail) || ruleAuditTrail.length === 0) {
    return;
  }
  for (const entry of ruleAuditTrail) {
    console.info('[clinical-rule-audit]', JSON.stringify(entry));
  }
};

module.exports = {
  buildClinicalFactor,
  buildRuleAuditEntry,
  buildRuleAuditTrail,
  anonymizeUserIdForAudit,
  applyP1ShortCircuit,
  shouldBlockMlDowngrade,
  logClinicalRuleAudit,
  ALLERGY_LEVELS,
  ALLERGY_SEVERITY_MULTIPLIERS,
  resolveMaxAllergySeverity,
  scoreAllergyCrossReactivityRule,
  P1_RULE,
};
