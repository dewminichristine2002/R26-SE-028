const express = require('express');
const checkInController = require('../controllers/checkInController');
const activityController = require('../controllers/activityController');
const caregiverController = require('../controllers/caregiverController');
const alertController = require('../controllers/alertController');
const narrativeController = require('../controllers/narrativeController');
const moodCheckinController = require('../controllers/moodCheckinController');
const emotionalTrendController = require('../controllers/emotionalTrendController');
const adaptiveQuestionBankController = require('../controllers/adaptiveQuestionBankController');
const adaptiveChatController = require('../controllers/adaptiveChatController');
const activityExecutionController = require('../controllers/activityExecutionController');
const wellnessTrendController = require('../controllers/wellnessTrendController');
const adaptiveCaregiverAlertController = require('../controllers/adaptiveCaregiverAlertController');
const reminiscenceMemoryController = require('../controllers/reminiscenceMemoryController');

const router = express.Router();

router.post('/check-ins', checkInController.createCheckIn);
router.post('/process-narrative', narrativeController.processNarrative);
router.post('/mood-checkin', moodCheckinController.createMoodCheckin);
router.get('/trends/:userId', emotionalTrendController.getUserTrends);
router.get('/wellness-trends/:userId', wellnessTrendController.getWellnessTrends);
router.get('/wellness-summary/:userId', wellnessTrendController.getWellnessSummary);
router.get('/caregiver-alerts/:userId', adaptiveCaregiverAlertController.listUserCaregiverAlerts);
router.get('/adaptive-question-bank/next', adaptiveQuestionBankController.getNextAdaptiveQuestion);
router.post('/adaptive-chat/start', adaptiveChatController.startAdaptiveChat);
router.post('/adaptive-chat/respond', adaptiveChatController.respondAdaptiveChat);
router.post('/adaptive-activities/start', activityExecutionController.startActivity);
router.get('/cognitive-activities', activityExecutionController.listCognitiveActivities);
router.post('/adaptive-activities/attempts/:attemptId/submit', activityExecutionController.submitActivity);
router.get('/sessions/:sessionId/chat-logs', checkInController.getChatLogs);
router.get('/elders/:elderId/history', checkInController.getHistory);
router.get('/elders/:elderId/trends/summary', checkInController.getTrendSummary);
router.get('/elders/:elderId/activities/next', activityController.getNextActivity);
router.post('/activities/:activityId/attempts', activityController.submitActivityAttempt);
router.get('/caregivers/:caregiverId/elders', caregiverController.getCaregiverElders);
router.get('/caregivers/:caregiverId/alerts', alertController.getCaregiverAlerts);
router.patch('/alerts/:alertId/acknowledge', alertController.acknowledgeAlert);
router.get('/caregivers/:caregiverId/elders/:elderId', caregiverController.getCaregiverElderDetail);

// Consent-based personalized reminiscence topics.
router.post('/reminiscence-topics/preview', reminiscenceMemoryController.previewTopic);
router.post('/reminiscence-topics', reminiscenceMemoryController.saveTopic);
router.get('/reminiscence-topics/:userId', reminiscenceMemoryController.listTopics);
router.delete('/reminiscence-topics/user/:userId', reminiscenceMemoryController.clearTopics);
router.delete('/reminiscence-topics/:topicId', reminiscenceMemoryController.deleteTopic);
router.get('/reminiscence-prompt/:userId', reminiscenceMemoryController.getPrompt);

// Memory entries for Life Book and Good Deeds (no photo upload)
router.post('/reminiscence-entries', reminiscenceMemoryController.createEntry);
router.get('/reminiscence-entries/:userId', reminiscenceMemoryController.listEntries);
router.delete('/reminiscence-entries/:entryId', reminiscenceMemoryController.deleteEntry);

module.exports = router;
