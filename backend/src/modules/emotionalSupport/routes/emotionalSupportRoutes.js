const express = require('express');
const checkInController = require('../controllers/checkInController');
const activityController = require('../controllers/activityController');
const caregiverController = require('../controllers/caregiverController');
const alertController = require('../controllers/alertController');

const router = express.Router();

router.post('/check-ins', checkInController.createCheckIn);
router.get('/elders/:elderId/history', checkInController.getHistory);
router.get('/elders/:elderId/trends/summary', checkInController.getTrendSummary);
router.get('/elders/:elderId/activities/next', activityController.getNextActivity);
router.post('/activities/:activityId/attempts', activityController.submitActivityAttempt);
router.get('/caregivers/:caregiverId/elders', caregiverController.getCaregiverElders);
router.get('/caregivers/:caregiverId/alerts', alertController.getCaregiverAlerts);
router.patch('/alerts/:alertId/acknowledge', alertController.acknowledgeAlert);
router.get('/caregivers/:caregiverId/elders/:elderId', caregiverController.getCaregiverElderDetail);

module.exports = router;
