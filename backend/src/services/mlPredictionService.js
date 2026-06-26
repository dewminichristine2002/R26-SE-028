const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { buildMlFeaturePayload } = require('./mlFeatureBuilder');

const mlRoot = path.resolve(__dirname, '..', '..', 'ml');
const modelPath = path.join(mlRoot, 'models', 'baseline_model.joblib');
const xgboostAliasPath = path.join(mlRoot, 'models', 'xgboost_production.joblib');
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

const modelAvailable = () =>
  (fs.existsSync(modelPath) || fs.existsSync(xgboostAliasPath)) && fs.existsSync(metadataPath);

const clampPercent = (value) => Math.max(0, Math.min(100, value));

const mapPredictionToRisk = (parsed) => {
  const adrProb = Number(parsed.adr_risk_probability ?? parsed.probability_dangerous ?? parsed.probability ?? 0);
  const safeProb = Number(parsed.probability_safe ?? (1 - adrProb));
  const label = parsed.risk_level_label || (parsed.prediction === 1 ? 'Dangerous' : 'Safe');
  const mlDangerScore = clampPercent(Math.round(adrProb * 1000) / 10);
  const mlClassConfidence = Number.isFinite(Number(parsed.class_confidence_score))
    ? clampPercent(Number(parsed.class_confidence_score))
    : clampPercent(Math.round(Math.max(adrProb, safeProb) * 1000) / 10);
  const youdensJThreshold = parsed.youdens_j_threshold || null;

  return {
    mlRiskScore: mlDangerScore,
    mlRiskLevel: label,
    mlDangerProbability: adrProb,
    mlClassProbability: adrProb,
    mlClassConfidenceScore: mlClassConfidence,
    adrRiskProbability: adrProb,
    youdensJThreshold,
    shap: parsed.shap || null,
  };
};

const predictMedicineRisk = async ({ analysisPayload, profile, questionnaireAnswers }) => {
  if (!modelAvailable()) {
    return {
      available: false,
      reason: 'Production XGBoost model not found. Run npm run ml:train first.',
    };
  }

  const payload = buildMlFeaturePayload({ analysisPayload, profile, questionnaireAnswers });

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
          adrRiskProbability: parsed.adr_risk_probability,
          probability: parsed.probability,
          probabilityDangerous: parsed.probability_dangerous,
          probabilityWarning: parsed.probability_warning,
          probabilitySafe: parsed.probability_safe,
          mlRiskScore: parsed.ml_risk_score,
          binaryPrediction: parsed.binary_prediction ?? parsed.prediction,
          probabilities: parsed.probabilities,
          riskLevelLabel: parsed.risk_level_label,
          youdensJThreshold: parsed.youdens_j_threshold,
          shap: parsed.shap,
          featurePayload: payload,
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
  buildMlFeaturePayload,
};
