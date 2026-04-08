# Emotional Support Frontend Feature

This feature folder is isolated from the shared mobile app entry points so your research component can be developed independently.

## Screen Map

### Elder navigation

- `ElderHomeScreen`
  Entry screen for emotional support
- `MoodCheckInScreen`
  Emoji, text, and optional voice input
- `AnalysisResultScreen`
  Detected emotion, support response, and next action
- `SupportChatScreen`
  Continued supportive conversation
- `CognitiveActivityScreen`
  One guided cognitive micro-activity
- `MoodHistoryScreen`
  Emotional history and trend cards
- `SessionSummaryScreen`
  Session recap and follow-up prompt

### Caregiver navigation

- `CaregiverDashboardScreen`
  Assigned elders and risk overview
- `CaregiverAlertListScreen`
  Open and acknowledged alerts
- `ElderDetailScreen`
  Elder emotional summary and recent sessions
- `TrendAnalyticsScreen`
  Trend charts and emotional statistics

## Suggested Navigation Wiring

Create a separate stack or tabs when the group is ready to mount your module:

1. If logged in as elder:
   `ElderHome -> MoodCheckIn -> AnalysisResult -> CognitiveActivity -> SessionSummary`
2. If logged in as caregiver:
   `CaregiverDashboard -> ElderDetail -> TrendAnalytics`
