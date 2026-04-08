const allergyModel = require('../models/allergyModel');

const normalizeText = (value) => (value == null ? '' : String(value).trim());

const normalizeNullableBoolean = (value) => {
  if (value === true || value === false) {
    return value;
  }

  return null;
};

const sanitizeProfilePayload = (body) => ({
  age: normalizeText(body.age),
  gender: normalizeText(body.gender),
  hasMedicineAllergy: normalizeNullableBoolean(body.hasMedicineAllergy),
  knownAllergiesText: normalizeText(body.knownAllergiesText),
  chronicDiseasesText: normalizeText(body.chronicDiseasesText),
  currentMedicationsText: normalizeText(body.currentMedicationsText),
  emergencyContact: normalizeText(body.emergencyContact),
  caregiverDetails: normalizeText(body.caregiverDetails),
});

const sanitizeQuestionnaireAnswers = (answers) => {
  if (!Array.isArray(answers)) {
    return null;
  }

  return answers
    .map((answer) => ({
      questionKey: normalizeText(answer?.questionKey),
      answerText: normalizeText(answer?.answerText),
    }))
    .filter((answer) => answer.questionKey);
};

const sanitizeRiskFactors = (riskFactors) => {
  if (!Array.isArray(riskFactors)) {
    return [];
  }

  return riskFactors
    .map((factor) => ({
      factorType: normalizeText(factor?.factorType),
      factorLabel: normalizeText(factor?.factorLabel),
      severity: normalizeText(factor?.severity),
      score: Number.isFinite(Number(factor?.score)) ? Number(factor.score) : 0,
    }))
    .filter((factor) => factor.factorLabel);
};

const sanitizeHistoryEntry = (historyEntry, fallbackPayload) => {
  if (!historyEntry) {
    return null;
  }

  return {
    inputMethod: normalizeText(historyEntry.inputMethod),
    rawInput: normalizeText(historyEntry.rawInput),
    medicineName: normalizeText(historyEntry.medicineName || fallbackPayload.medicineName),
    normalizedDrugName: normalizeText(historyEntry.normalizedDrugName || fallbackPayload.normalizedDrugName),
    dose: normalizeText(historyEntry.dose),
    frequency: normalizeText(historyEntry.frequency),
    riskScore: Number.isFinite(Number(historyEntry.riskScore)) ? Number(historyEntry.riskScore) : fallbackPayload.riskScore,
    riskLevel: normalizeText(historyEntry.riskLevel || fallbackPayload.riskLevel),
  };
};

const sanitizeCardPayload = (body) => {
  const payload = {
    title: normalizeText(body.title),
    medicineName: normalizeText(body.medicineName),
    normalizedDrugName: normalizeText(body.normalizedDrugName),
    status: normalizeText(body.status) || 'draft',
    riskScore: Number.isFinite(Number(body.riskScore)) ? Number(body.riskScore) : null,
    riskLevel: normalizeText(body.riskLevel),
    explanation: normalizeText(body.explanation),
    recommendation: normalizeText(body.recommendation),
    riskFactors: sanitizeRiskFactors(body.riskFactors),
  };

  payload.historyEntry = sanitizeHistoryEntry(body.historyEntry, payload);
  return payload;
};

const sanitizeReactionPayload = (body) => ({
  medicineCheckId: Number.isFinite(Number(body.medicineCheckId)) ? Number(body.medicineCheckId) : null,
  symptoms: normalizeText(body.symptoms),
  severity: normalizeText(body.severity),
  notes: normalizeText(body.notes),
});

const normalizeYesNo = (value) => {
  if (value === true || value === false) {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  if (['yes', 'true', '1'].includes(normalized)) {
    return true;
  }

  if (['no', 'false', '0'].includes(normalized)) {
    return false;
  }

  return null;
};

const sanitizeAnalysisPayload = (body) => ({
  inputMethod: normalizeText(body.inputMethod) || 'manual',
  medicineName: normalizeText(body.medicineName),
  normalizedDrugName: normalizeText(body.normalizedDrugName || body.medicineName).toLowerCase(),
  dose: normalizeText(body.dose),
  frequency: normalizeText(body.frequency),
  takenBefore: normalizeYesNo(body.takenBefore),
  hadReactionBefore: normalizeYesNo(body.hadReactionBefore),
  symptomMatch: normalizeText(body.symptomMatch),
  severity: normalizeText(body.severity),
  takingOtherMedicinesNow: normalizeYesNo(body.takingOtherMedicinesNow),
  notes: normalizeText(body.notes),
});

const buildAnalysis = (payload, profile, questionnaireAnswers) => {
  const normalizedDrug = payload.normalizedDrugName || payload.medicineName.toLowerCase();
  const knownAllergiesText = normalizeText(profile?.knownAllergiesText).toLowerCase();
  const chronicDiseasesText = normalizeText(profile?.chronicDiseasesText).toLowerCase();
  const currentMedicationsText = normalizeText(profile?.currentMedicationsText).toLowerCase();
  const questionnaireText = questionnaireAnswers
    .map((item) => normalizeText(item.answerText).toLowerCase())
    .join(' ');

  const riskFactors = [];
  let ruleScore = 0;

  const addFactor = (factorType, factorLabel, severity, score) => {
    riskFactors.push({
      factorType,
      factorLabel,
      severity,
      score,
    });
    ruleScore += score;
  };

  if (normalizedDrug && knownAllergiesText && knownAllergiesText.includes(normalizedDrug)) {
    addFactor('allergy_match', 'This medicine matches a known allergy in the profile.', 'high', 40);
  }

  if (payload.hadReactionBefore === true || questionnaireText.includes(normalizedDrug)) {
    addFactor('past_reaction', 'Past medicine reaction history suggests extra caution.', 'medium', 25);
  }

  if (payload.takingOtherMedicinesNow === true || currentMedicationsText) {
    addFactor('interaction_risk', 'Current medicines may increase interaction risk.', 'medium', 15);
  }

  if (chronicDiseasesText) {
    addFactor('chronic_condition', 'Existing health conditions may change medicine safety.', 'medium', 20);
  }

  if (payload.symptomMatch) {
    addFactor('symptom_match', 'Reported symptoms match a known concern to review.', 'low', 10);
  }

  if (payload.severity.toLowerCase() === 'severe') {
    addFactor('severe_history', 'A severe reaction history raises the safety risk.', 'high', 20);
  }

  if (profile?.hasMedicineAllergy === true) {
    addFactor('allergy_profile', 'The profile already records medicine allergies.', 'medium', 10);
  }

  ruleScore = Math.min(ruleScore, 100);

  let mlScore = 10;
  mlScore += profile?.hasMedicineAllergy === true ? 20 : 0;
  mlScore += payload.hadReactionBefore === true ? 20 : 0;
  mlScore += payload.takingOtherMedicinesNow === true ? 15 : 0;
  mlScore += payload.severity.toLowerCase() === 'severe' ? 20 : payload.severity.toLowerCase() === 'moderate' ? 10 : 0;
  mlScore += payload.symptomMatch ? 10 : 0;
  mlScore += chronicDiseasesText ? 15 : 0;
  mlScore = Math.min(mlScore, 100);

  const riskScore = Math.round((0.6 * ruleScore) + (0.4 * mlScore));
  let riskLevel = 'Safe';

  if (riskScore >= 60) {
    riskLevel = 'Dangerous';
  } else if (riskScore >= 25) {
    riskLevel = 'Warning';
  }

  const explanationParts = riskFactors.slice(0, 3).map((factor) => factor.factorLabel);
  const explanation = explanationParts.length > 0
    ? explanationParts.join(' ')
    : 'No strong warning signs were found in the saved profile, but continue checking carefully.';

  let recommendation = 'Use as directed and keep monitoring for any unusual reaction.';
  if (riskLevel === 'Warning') {
    recommendation = 'Use caution and talk to a pharmacist or caregiver before taking this medicine.';
  }
  if (riskLevel === 'Dangerous') {
    recommendation = 'Do not take this medicine until you speak to a doctor or qualified clinician.';
  }

  return {
    title: `${payload.medicineName || 'Medicine'} Safety Check`,
    medicineName: payload.medicineName,
    normalizedDrugName: normalizedDrug,
    status: 'completed',
    riskScore,
    riskLevel,
    explanation,
    recommendation,
    riskFactors,
    historyEntry: {
      inputMethod: payload.inputMethod,
      rawInput: payload.notes || payload.medicineName,
      medicineName: payload.medicineName,
      normalizedDrugName: normalizedDrug,
      dose: payload.dose,
      frequency: payload.frequency,
      riskScore,
      riskLevel,
    },
  };
};

const fetchProfile = async (req, res, next) => {
  try {
    const profile = await allergyModel.getProfile(req.user.id);
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
};

const saveProfile = async (req, res, next) => {
  try {
    const profile = await allergyModel.upsertProfile(req.user.id, sanitizeProfilePayload(req.body));
    return res.json({ profile });
  } catch (error) {
    return next(error);
  }
};

const fetchQuestionnaire = async (req, res, next) => {
  try {
    const answers = await allergyModel.listQuestionnaireAnswers(req.user.id);
    return res.json({ answers });
  } catch (error) {
    return next(error);
  }
};

const saveQuestionnaire = async (req, res, next) => {
  try {
    const answers = sanitizeQuestionnaireAnswers(req.body.answers);

    if (!answers) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    const savedAnswers = await allergyModel.replaceQuestionnaireAnswers(req.user.id, answers);
    return res.json({ answers: savedAnswers });
  } catch (error) {
    return next(error);
  }
};

const fetchCards = async (req, res, next) => {
  try {
    const cards = await allergyModel.listCards(req.user.id);
    return res.json({ cards });
  } catch (error) {
    return next(error);
  }
};

const fetchCard = async (req, res, next) => {
  try {
    const cardId = Number(req.params.id);
    if (!Number.isInteger(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' });
    }

    const card = await allergyModel.getCardById(req.user.id, cardId);
    if (!card) {
      return res.status(404).json({ error: 'Allergy card not found' });
    }

    return res.json({ card });
  } catch (error) {
    return next(error);
  }
};

const createCard = async (req, res, next) => {
  try {
    const payload = sanitizeCardPayload(req.body);

    if (!payload.title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const card = await allergyModel.createCard(req.user.id, payload);
    return res.status(201).json({ card });
  } catch (error) {
    return next(error);
  }
};

const saveCard = async (req, res, next) => {
  try {
    const cardId = Number(req.params.id);
    if (!Number.isInteger(cardId)) {
      return res.status(400).json({ error: 'Invalid card id' });
    }

    const payload = sanitizeCardPayload(req.body);
    const card = await allergyModel.updateCard(req.user.id, cardId, payload);

    if (!card) {
      return res.status(404).json({ error: 'Allergy card not found' });
    }

    return res.json({ card });
  } catch (error) {
    return next(error);
  }
};

const fetchHistory = async (req, res, next) => {
  try {
    const history = await allergyModel.listHistory(req.user.id);
    return res.json({ history });
  } catch (error) {
    return next(error);
  }
};

const createReaction = async (req, res, next) => {
  try {
    const payload = sanitizeReactionPayload(req.body);

    if (!payload.symptoms) {
      return res.status(400).json({ error: 'symptoms is required' });
    }

    const reaction = await allergyModel.createReactionLog(req.user.id, payload);
    return res.status(201).json({ reaction });
  } catch (error) {
    return next(error);
  }
};

const analyzeMedicine = async (req, res, next) => {
  try {
    const payload = sanitizeAnalysisPayload(req.body);

    if (!payload.medicineName) {
      return res.status(400).json({ error: 'medicineName is required' });
    }

    const [profile, questionnaireAnswers] = await Promise.all([
      allergyModel.getProfile(req.user.id),
      allergyModel.listQuestionnaireAnswers(req.user.id),
    ]);

    const analysisPayload = buildAnalysis(payload, profile, questionnaireAnswers);
    const card = await allergyModel.createCard(req.user.id, analysisPayload);

    return res.status(201).json({
      card,
      analysis: {
        riskScore: analysisPayload.riskScore,
        riskLevel: analysisPayload.riskLevel,
        explanation: analysisPayload.explanation,
        recommendation: analysisPayload.recommendation,
        riskFactors: analysisPayload.riskFactors,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  fetchProfile,
  saveProfile,
  fetchQuestionnaire,
  saveQuestionnaire,
  fetchCards,
  fetchCard,
  createCard,
  saveCard,
  fetchHistory,
  createReaction,
  analyzeMedicine,
};
