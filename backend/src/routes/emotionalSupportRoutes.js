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

const router = express.Router();

router.post('/check-ins', checkInController.createCheckIn);
router.post('/process-narrative', narrativeController.processNarrative);
router.post('/mood-checkin', moodCheckinController.createMoodCheckin);
router.get('/trends/:userId', emotionalTrendController.getUserTrends);
router.get('/adaptive-question-bank/next', adaptiveQuestionBankController.getNextAdaptiveQuestion);
router.post('/adaptive-chat/start', adaptiveChatController.startAdaptiveChat);
router.post('/adaptive-chat/respond', adaptiveChatController.respondAdaptiveChat);
router.get('/sessions/:sessionId/chat-logs', checkInController.getChatLogs);
router.get('/elders/:elderId/history', checkInController.getHistory);
router.get('/elders/:elderId/trends/summary', checkInController.getTrendSummary);
router.get('/elders/:elderId/activities/next', activityController.getNextActivity);
router.post('/activities/:activityId/attempts', activityController.submitActivityAttempt);
router.get('/caregivers/:caregiverId/elders', caregiverController.getCaregiverElders);
router.get('/caregivers/:caregiverId/alerts', alertController.getCaregiverAlerts);
router.patch('/alerts/:alertId/acknowledge', alertController.acknowledgeAlert);
router.get('/caregivers/:caregiverId/elders/:elderId', caregiverController.getCaregiverElderDetail);

module.exports = router;
