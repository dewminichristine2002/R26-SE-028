import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { EmotionalSupportProvider } from './context/EmotionalSupportContext';
import AnalysisResultScreen from './screens/AnalysisResultScreen';
import CaregiverAlertListScreen from './screens/CaregiverAlertListScreen';
import CaregiverDashboardScreen from './screens/CaregiverDashboardScreen';
import CognitiveActivityScreen from './screens/CognitiveActivityScreen';
import ElderDetailScreen from './screens/ElderDetailScreen';
import ElderHomeScreen from './screens/ElderHomeScreen';
import MoodCheckInScreen from './screens/MoodCheckInScreen';
import MoodHistoryScreen from './screens/MoodHistoryScreen';
import SessionSummaryScreen from './screens/SessionSummaryScreen';
import SupportChatScreen from './screens/SupportChatScreen';
import TrendAnalyticsScreen from './screens/TrendAnalyticsScreen';

const Stack = createStackNavigator();

export default function EmotionalSupportNavigator() {
  return (
    <EmotionalSupportProvider>
      <NavigationContainer independent>
        <Stack.Navigator initialRouteName="ElderHome">
          <Stack.Screen name="ElderHome" component={ElderHomeScreen} options={{ title: 'Elder Support' }} />
          <Stack.Screen name="MoodCheckIn" component={MoodCheckInScreen} options={{ title: 'Mood Check-In' }} />
          <Stack.Screen name="AnalysisResult" component={AnalysisResultScreen} options={{ title: 'Analysis Result' }} />
          <Stack.Screen name="SupportChat" component={SupportChatScreen} options={{ title: 'Support Chat' }} />
          <Stack.Screen name="CognitiveActivity" component={CognitiveActivityScreen} options={{ title: 'Cognitive Activity' }} />
          <Stack.Screen name="MoodHistory" component={MoodHistoryScreen} options={{ title: 'Mood History' }} />
          <Stack.Screen name="SessionSummary" component={SessionSummaryScreen} options={{ title: 'Session Summary' }} />
          <Stack.Screen name="CaregiverDashboard" component={CaregiverDashboardScreen} options={{ title: 'Caregiver Dashboard' }} />
          <Stack.Screen name="CaregiverAlertList" component={CaregiverAlertListScreen} options={{ title: 'Caregiver Alerts' }} />
          <Stack.Screen name="ElderDetail" component={ElderDetailScreen} options={{ title: 'Elder Detail' }} />
          <Stack.Screen name="TrendAnalytics" component={TrendAnalyticsScreen} options={{ title: 'Trend Analytics' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </EmotionalSupportProvider>
  );
}
