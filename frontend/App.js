import React, { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n/config';
import { languageService } from './src/services/languageService';
import HomeScreen from './src/screens/HomeScreen';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { authService } from './src/services/authService';
import { userService } from './src/services/userService';
import { reminderNotificationService } from './src/services/reminderNotificationService';

let NotificationsModule = null;
let SpeechModule = null;

try {
  NotificationsModule = require('expo-notifications');
} catch (error) {
  console.log('[App] Notifications module unavailable:', error?.message || error);
}

try {
  SpeechModule = require('expo-speech');
} catch (error) {
  console.log('[App] Speech module unavailable:', error?.message || error);
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [homeLaunchIntent, setHomeLaunchIntent] = useState(null);

  // Android hardware back button navigation
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      // If on login/register, exit app
      if (!isAuthenticated) {
        return false;
      }
      // If on profile/settings, go back to home
      if (activeScreen === 'profile' || activeScreen === 'settings') {
        setActiveScreen('home');
        return true;
      }
      // If not on home, go back to home
      if (activeScreen !== 'home') {
        setActiveScreen('home');
        return true;
      }
      // Otherwise, let default (exit app)
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [isAuthenticated, activeScreen]);

  useEffect(() => {
    const bootstrap = async () => {
      await languageService.loadSavedLanguage();

      const token = await authService.getToken();

      if (token) {
        try {
          const profile = await userService.getMyProfile();
          setCurrentUser(profile);
          setIsAuthenticated(true);
        } catch (error) {
          console.log('[App] Session restore failed, clearing local auth:', error.message);
          await authService.logout();
        }
      }

      setTimeout(() => {
        setIsBooting(false);
      }, 1500);
    };

    bootstrap();
  }, []);

  useEffect(() => {
    const scheduleReminders = async () => {
      if (!isAuthenticated) {
        return;
      }

      try {
        await reminderNotificationService.rescheduleDailyReminders();
      } catch (error) {
        console.log('[App] Reminder scheduling failed:', error?.message || error);
      }
    };

    scheduleReminders();
  }, [isAuthenticated, currentUser?.id]);

  useEffect(() => {
    if (!NotificationsModule || !SpeechModule) {
      return undefined;
    }

    const subscription = NotificationsModule.addNotificationReceivedListener((event) => {
      const title = event?.request?.content?.title || '';
      const body = event?.request?.content?.body || '';
      const speechText = [title, body].filter(Boolean).join('. ');

      if (!speechText) {
        return;
      }

      SpeechModule.speak(speechText, {
        language: 'en',
        pitch: 1.0,
        rate: 0.95,
      });
    });

    return () => {
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!NotificationsModule) {
      return undefined;
    }

    const responseSubscription = NotificationsModule.addNotificationResponseReceivedListener((response) => {
      const notificationType = response?.notification?.request?.content?.data?.type;
      if (notificationType !== 'medicine-reminder') {
        return;
      }

      setActiveScreen('home');
      setHomeLaunchIntent({
        type: 'schedule-board',
        nonce: Date.now(),
      });
    });

    return () => {
      responseSubscription?.remove?.();
    };
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setActiveScreen('home');
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setAuthMode('login');
    setActiveScreen('home');
  };

  const handleProfileUpdated = (updatedUser) => {
    setCurrentUser(updatedUser);
  };

  const renderContent = () => {
    if (isBooting) {
      return <SplashScreen />;
    }

    if (!isAuthenticated) {
      if (authMode === 'register') {
        return (
          <RegisterScreen
            onRegisterSuccess={handleLoginSuccess}
            onBackToLogin={() => setAuthMode('login')}
          />
        );
      }

      return (
        <LoginScreen
          onLoginSuccess={handleLoginSuccess}
          onNavigateRegister={() => setAuthMode('register')}
        />
      );
    }

    if (activeScreen === 'profile') {
      return (
        <ProfileScreen
          user={currentUser}
          onBack={() => setActiveScreen('home')}
          onOpenSettings={() => setActiveScreen('settings')}
          onProfileUpdated={handleProfileUpdated}
          onLogout={handleLogout}
        />
      );
    }

    if (activeScreen === 'settings') {
      return (
        <SettingsScreen
          onBack={() => setActiveScreen('profile')}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <HomeScreen
        user={currentUser}
        launchIntent={homeLaunchIntent}
        onOpenProfile={() => setActiveScreen('profile')}
        onLogout={handleLogout}
      />
    );
  };

  return (
    <I18nextProvider i18n={i18n}>
      {renderContent()}
    </I18nextProvider>
  );
}
