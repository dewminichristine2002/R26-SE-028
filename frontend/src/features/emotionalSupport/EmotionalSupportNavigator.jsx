import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { EmotionalSupportProvider } from './context/EmotionalSupportContext';
import ElderHomeScreen from './screens/ElderHomeScreen';
import EmotionalTrendScreen from './screens/EmotionalTrendScreen';
import ReminiscenceActivityScreen from './screens/ReminiscenceActivityScreen';
import AdaptiveSupportChatScreen from './screens/AdaptiveSupportChatScreen';
import SupportMoodCheckInScreen from './screens/SupportMoodCheckInScreen';
import SupportResultScreen from './screens/SupportResultScreen';

const Stack = createStackNavigator();

export default function EmotionalSupportNavigator() {
  return (
    <EmotionalSupportProvider>
      <NavigationContainer independent>
        <Stack.Navigator initialRouteName="ElderHome">
          <Stack.Screen name="ElderHome" component={ElderHomeScreen} options={{ title: 'Elder Support' }} />
          <Stack.Screen name="SupportMoodCheckInScreen" component={SupportMoodCheckInScreen} options={{ title: 'Optional Mood Check-In' }} />
          <Stack.Screen name="AdaptiveSupportChatScreen" component={AdaptiveSupportChatScreen} options={{ title: 'Adaptive Check-In' }} />
          <Stack.Screen name="SupportResultScreen" component={SupportResultScreen} options={{ title: 'Support Result' }} />
          <Stack.Screen name="ReminiscenceActivityScreen" component={ReminiscenceActivityScreen} options={{ title: 'Memory Activity' }} />
          <Stack.Screen name="EmotionalTrendScreen" component={EmotionalTrendScreen} options={{ title: 'Emotional Trends' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </EmotionalSupportProvider>
  );
}
