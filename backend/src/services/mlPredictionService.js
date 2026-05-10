const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  resolveDrugClass,
  extractDrugClassesFromText,
} = require('./drugClassLookupService');

const mlRoot = path.resolve(__dirname, '..', '..', 'ml');
const modelPath = path.join(mlRoot, 'models', 'baseline_model.joblib');
const metadataPath = path.join(mlRoot, 'models', 'baseline_model_metadata.json');
const predictorPath = path.join(mlRoot, 'predict.py');

const resolvePythonPath = () => {
  const configured = process.env.ML_PYTHON_PATH;
  if (configured) {
    return configured;
  }

  const localWindowsVenv = path.join(mlRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(localWindowsVenv)) {
    return localWindowsVenv;
  }

  return 'python';
};

const modelAvailable = () => fs.existsSync(modelPath) && fs.existsSync(metadataPath);

const combineText = (fields) =>
  [
    fields.medicine_name,
    fields.normalized_drug_name,
    fields.ingredient_name,
    fields.therapeutic_class,
    fields.knowledge_sources,
    fields.known_allergies_text,
    fields.chronic_diseases_text,
    fields.current_medications_text,
    fields.q_reaction_symptoms,
    fields.q_doctor_advice,
    fields.raw_input,
  ]
    .filter((value) => value != null && String(value).trim() !== '')
    .join(' ');

const buildPredictionPayload = ({ analysisPayload, profile, questionnaireAnswers }) => {
  const answerMap = questionnaireAnswers.reduce((acc, item) => {
    acc[item.questionKey] = item.answerText;
    return acc;
  }, {});

  const fields = {
    medicine_name: analysisPayload.medicineName || '',
    normalized_drug_name: analysisPayload.normalizedDrugName || '',
    ingredient_name: analysisPayload.ingredientName || '',
    therapeutic_class: analysisPayload.therapeuticClass || '',
    knowledge_sources: Array.isArray(analysisPayload.knowledgeSources) ? analysisPayload.knowledgeSources.join(' ') : '',
    known_allergies_text: profile?.knownAllergiesText || '',
    chronic_diseases_text: profile?.chronicDiseasesText || '',
    current_medications_text: profile?.currentMedicationsText || '',
    q_reaction_symptoms: answerMap.reactionSymptoms || '',
    q_doctor_advice: answerMap.doctorAdvice || '',
    raw_input: analysisPayload.historyEntry?.rawInput || analysisPayload.medicineName || '',
  };
  const drugClassInfo = resolveDrugClass(
    analysisPayload.normalizedDrugName,
    analysisPayload.medicineName,
    analysisPayload.ingredientName,
    analysisPayload.medicationKnowledge?.rxnormMatchedName
  );
  const profileDrugClasses = new Set([
    ...extractDrugClassesFromText(profile?.knownAllergiesText),
    ...extractDrugClassesFromText(answerMap.medicineName || ''),
  ]);

  return {
    side_effect_count: Number(analysisPayload.sideEffectCount || 0),
    severe_side_effect_count: Number(analysisPayload.severeSideEffectCount || 0),
    side_effect_match_count: Number(analysisPayload.sideEffectMatchCount || 0),
    interaction_count: Number(analysisPayload.interactionCount || 0),
    gender: profile?.gender || 'missing',
    input_method: analysisPayload.historyEntry?.inputMethod || 'manual',
    max_interaction_severity: analysisPayload.maxInteractionSeverity || 'none',
    has_medicine_allergy: String(profile?.hasMedicineAllergy ?? 'missing'),
    has_severe_reaction_log: '0',
    drug_class: drugClassInfo?.drug_class || 'unknown',
    same_class_allergy: profileDrugClasses.has(drugClassInfo?.drug_class || '') ? 1 : 0,
    combined_text: combineText(fields),
  };
};

const mapPredictionToRisk = (parsed) => {
  const label = parsed.risk_level_label || 'Safe';
  const dangerProb = Number(
    parsed.probability_dangerous != null ? parsed.probability_dangerous : parsed.probability || 0
  );
  const classProb = Number(parsed.probability || 0);
  const mlDangerScore = Math.max(0, Math.min(100, Math.round(dangerProb * 100)));
  const mlClassConfidence = Math.max(0, Math.min(100, Math.round(classProb * 100)));

  return {
    mlRiskScore: mlDangerScore,
    mlRiskLevel: label,
    mlDangerProbability: dangerProb,
    mlClassProbability: classProb,
    mlClassConfidenceScore: mlClassConfidence,
  };
};

const predictMedicineRisk = async ({ analysisPayload, profile, questionnaireAnswers }) => {
  if (!modelAvailable()) {
    return {
      available: false,
      reason: 'Model artifacts not found. Train the baseline model first.',
    };
  }

  const payload = buildPredictionPayload({ analysisPayload, profile, questionnaireAnswers });

  return new Promise((resolve) => {
    const python = resolvePythonPath();
    const child = spawn(python, [predictorPath], {
      cwd: mlRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      resolve({
        available: false,
        reason: `Failed to start ML predictor: ${error.message}`,
      });
    });

    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          available: false,
          reason: stderr.trim() || `ML predictor exited with code ${code}`,
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          available: true,
          target: parsed.target,
          prediction: parsed.prediction,
          probability: parsed.probability,
          probabilityDangerous: parsed.probability_dangerous,
          probabilityWarning: parsed.probability_warning,
          probabilitySafe: parsed.probability_safe,
          probabilities: parsed.probabilities,
          riskLevelLabel: parsed.risk_level_label,
          ...mapPredictionToRisk(parsed),
          modelPath: parsed.model_path,
        });
      } catch (error) {
        resolve({
          available: false,
          reason: `Failed to parse ML predictor output: ${error.message}`,
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
};

module.exports = {
  predictMedicineRisk,
};
