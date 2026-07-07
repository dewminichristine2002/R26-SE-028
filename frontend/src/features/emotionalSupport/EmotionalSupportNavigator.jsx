import React, { useMemo, useState } from 'react';
import { EmotionalSupportProvider } from './context/EmotionalSupportContext';
import ElderHomeScreen from './screens/ElderHomeScreen';
import EmotionalTrendScreen from './screens/EmotionalTrendScreen';
import ReminiscenceActivityScreen from './screens/ReminiscenceActivityScreen';
import AdaptiveSupportChatScreen from './screens/AdaptiveSupportChatScreen';
import SupportMoodCheckInScreen from './screens/SupportMoodCheckInScreen';
import SupportResultScreen from './screens/SupportResultScreen';

const routes = {
  ElderHome: ElderHomeScreen,
  SupportMoodCheckInScreen,
  AdaptiveSupportChatScreen,
  SupportResultScreen,
  ReminiscenceActivityScreen,
  EmotionalTrendScreen,
};

export default function EmotionalSupportNavigator() {
  const [routeStack, setRouteStack] = useState([{ name: 'ElderHome', params: {} }]);
  const currentRoute = routeStack[routeStack.length - 1];
  const CurrentScreen = routes[currentRoute.name] || ElderHomeScreen;

  const navigation = useMemo(
    () => ({
      navigate: (name, params = {}) => {
        if (!routes[name]) {
          return;
        }
        setRouteStack((stack) => [...stack, { name, params }]);
      },
      goBack: () => {
        setRouteStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
      },
      popToTop: () => {
        setRouteStack([{ name: 'ElderHome', params: {} }]);
      },
    }),
    []
  );

  return (
    <EmotionalSupportProvider>
      <CurrentScreen navigation={navigation} route={{ name: currentRoute.name, params: currentRoute.params }} />
    </EmotionalSupportProvider>
  );
}
