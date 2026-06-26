const { HYBRID_ML_WEIGHT, HYBRID_RULE_WEIGHT, RISK_THRESHOLDS, classifyRiskLevel } = require('../config/hybridScoring');

const RULE_RECOMMENDATIONS = {
  allergy_match: 'Do not take this medicine. Ask your clinician for a non-allergenic alternative.',
  allergy_class_match: 'Avoid medicines in the same drug class/family. Ask a pharmacist about a different class.',
  nsaid_aspirin_cross_allergy: 'Avoid NSAIDs including aspirin-related products; discuss paracetamol or other options with a clinician.',
  past_reaction: 'Use extra caution and confirm with your doctor before restarting or switching medicines.',
  ddinter_interaction: 'Review all interacting medicines with a pharmacist or doctor before co-administration.',
  sider_symptom_match: 'Monitor closely for worsening symptoms; seek care if symptoms match known side effects.',
  chronic_condition: 'Confirm dosing and safety with a clinician because of your chronic condition profile.',
  pregnancy_contraindication: 'Seek obstetric or primary care advice before use in pregnancy.',
  renal_impairment_risk: 'Kidney function may affect clearance — dose adjustment or alternative may be needed.',
  hepatic_impairment_risk: 'Liver function may affect metabolism — clinician review is advised.',
  narrow_therapeutic_index: 'This medicine has a narrow therapeutic index; strict monitoring and prescriber oversight are required.',
  polypharmacy_risk: 'Reduce interaction risk by reviewing your full medicine list with a pharmacist.',
  elder_risk: 'Elderly patients may need lower doses or closer monitoring — confirm with prescriber.',
  elder_high_caution_medicine: 'High-caution medicine in older adults — clinician review recommended.',
  dangerous_combination: 'This combination is high risk — do not combine without explicit clinical approval.',
  medicine_history: 'Prior checks for this drug showed concern — discuss with your care team before use.',
  knowledge_gap: 'Confirm spelling/strength so interaction and side-effect data apply correctly.',
  ml_prediction: 'ML model flagged elevated ADR probability — use alongside clinical rule findings, not alone.',
};

const CLASS_ALTERNATIVES = {
  penicillin: ['Macrolide antibiotic (e.g. azithromycin) — only if prescribed and not contraindicated'],
  cephalosporin: ['Non-beta-lactam antibiotic — discuss with prescriber if beta-lactam allergy is documented'],
  nsaid: ['Paracetamol (acetaminophen) for pain/fever — if liver disease is not present'],
  sulfonamide: ['Non-sulfa antibiotic or alternative class — prescriber selection required'],
  fluoroquinolone: ['Alternative antibiotic class — discuss culture-guided choice with clinician'],
  macrolide: ['Alternative antibiotic if macrolide intolerance — clinician to select'],
};

const getClinicalAction = (riskLevel) => {
  if (riskLevel === 'Dangerous') {
    return {
      band: `${RISK_THRESHOLDS.dangerousMin}-100`,
      icon: '🚫',
      label: 'Dangerous',
      action: 'Block; require clinical override with documented justification',
      proceedAllowed: false,
    };
  }
  if (riskLevel === 'Warning') {
    return {
      band: `${RISK_THRESHOLDS.warningMin}-${RISK_THRESHOLDS.dangerousMin - 1}`,
      icon: '⚠️',
      label: 'Warning',
      action: 'Display alert; recommend GP consultation',
      proceedAllowed: true,
    };
  }
  return {
    band: `0-${RISK_THRESHOLDS.warningMin - 1}`,
      icon: '✅',
      label: 'Safe',
      action: 'Proceed; log interaction',
      proceedAllowed: true,
  };
};

const buildAllergyConflicts = ({ riskFactors, profile, drugClassInfo }) => {
  const direct = (riskFactors || []).find((f) => f.factorType === 'allergy_match');
  const classMatch = (riskFactors || []).find((f) => f.factorType === 'allergy_class_match');
  const nsaidCross = (riskFactors || []).find((f) => f.factorType === 'nsaid_aspirin_cross_allergy');

  return {
    directAllergyMatch: Boolean(direct),
    classAllergyMatch: Boolean(classMatch),
    nsaidAspirinCrossReactivity: Boolean(nsaidCross),
    profileAllergiesText: profile?.knownAllergiesText || '',
    drugClass: drugClassInfo?.drug_class || 'unknown',
    atcCode: drugClassInfo?.atc_code || '',
    atcGroupCode: drugClassInfo?.atc_group_code || '',
    atcGroupName: drugClassInfo?.atc_group_name || '',
    atcClassLabel: drugClassInfo?.atc_class_label || '',
    summary: [
      direct ? 'Direct allergy match with profile.' : null,
      classMatch ? `ATC/drug-class overlap (${drugClassInfo?.drug_class || 'unknown'} family).` : null,
      nsaidCross ? 'NSAID/aspirin cross-reactivity risk.' : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
};

const buildAlternativeSuggestions = ({ riskFactors, drugClassInfo, medicationKnowledge }) => {
  const suggestions = new Set();
  const drugClass = drugClassInfo?.drug_class || 'unknown';

  if ((riskFactors || []).some((f) => ['allergy_match', 'allergy_class_match', 'nsaid_aspirin_cross_allergy'].includes(f.factorType))) {
    (CLASS_ALTERNATIVES[drugClass] || []).forEach((item) => suggestions.add(item));
  }

  if ((medicationKnowledge?.interactionCount || 0) > 0) {
    suggestions.add('Ask whether an equivalent medicine with fewer interactions is appropriate.');
  }

  if (suggestions.size === 0 && drugClass !== 'unknown') {
    suggestions.add('No automatic substitute is suggested — prescriber should select an alternative based on indication.');
  }

  return Array.from(suggestions);
};

const buildTriggeredRules = (riskFactors) =>
  (riskFactors || []).map((factor) => ({
    factorType: factor.factorType,
    factorLabel: factor.factorLabel,
    severity: factor.severity,
    score: factor.score,
    recommendation: RULE_RECOMMENDATIONS[factor.factorType] || 'Discuss this finding with a pharmacist or doctor.',
  }));

const buildDrugInteractions = (medicationKnowledge) =>
  (medicationKnowledge?.interactions || []).map((item) => ({
    interactingDrug: item.interactingDrug || item.interactingNormalizedDrug || 'Unknown medicine',
    severity: item.severity || 'unknown',
    description: item.description || '',
    evidenceSource: 'DDInter',
  }));

const buildRiskReport = ({
  riskLevel,
  riskScore,
  ruleScore,
  mlDangerScore,
  hybridBreakdown,
  riskFactors,
  guidelines,
  profile,
  drugClassInfo,
  medicationKnowledge,
  mlPrediction,
  clinicalOverride,
}) => {
  const clinicalAction = getClinicalAction(riskLevel);
  const requiresClinicalOverride = riskLevel === 'Dangerous';
  const overrideAccepted = Boolean(clinicalOverride?.accepted && String(clinicalOverride?.justification || '').trim().length >= 10);

  return {
    classification: {
      riskLevel,
      finalScore: riskScore,
      badge: clinicalAction.label,
      icon: clinicalAction.icon,
      scoreBand: clinicalAction.band,
      clinicalAction: clinicalAction.action,
      thresholds: RISK_THRESHOLDS,
    },
    scoreBreakdown: {
      formula: `${HYBRID_RULE_WEIGHT} × RuleScore + ${HYBRID_ML_WEIGHT} × (ML ADR probability × 100)`,
      ruleScore,
      mlScore: mlDangerScore,
      blendedScore: riskScore,
      hybridBreakdown: hybridBreakdown || null,
    },
    triggeredRules: buildTriggeredRules(riskFactors),
    shap: mlPrediction?.shap || null,
    drugInteractions: buildDrugInteractions(medicationKnowledge),
    allergyConflicts: buildAllergyConflicts({ riskFactors, profile, drugClassInfo }),
    clinicalRecommendations: {
      general: Array.isArray(guidelines) ? guidelines : [],
      perRule: buildTriggeredRules(riskFactors).map((rule) => ({
        factorType: rule.factorType,
        recommendation: rule.recommendation,
      })),
    },
    alternativeSuggestions: buildAlternativeSuggestions({ riskFactors, drugClassInfo, medicationKnowledge }),
    safetyControls: {
      requiresClinicalOverride,
      proceedAllowed: clinicalAction.proceedAllowed || overrideAccepted,
      clinicalOverride: overrideAccepted
        ? {
            accepted: true,
            justification: String(clinicalOverride.justification).trim(),
            documentedAt: clinicalOverride.documentedAt || new Date().toISOString(),
          }
        : null,
    },
  };
};

module.exports = {
  buildRiskReport,
  getClinicalAction,
  RULE_RECOMMENDATIONS,
};
