import React, { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n/config';
import EmotionalSupportNavigator from './src/features/emotionalSupport/EmotionalSupportNavigator';
import { languageService } from './src/services/languageService';
import HomeScreen from './src/screens/HomeScreen';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MedicineSafetyScreen from './src/screens/MedicineSafetyScreenFixed';
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
    // Android hardware back button navigation
    useEffect(() => {
      if (Platform.OS !== 'android') return;
      const onBackPress = () => {
        // If on login/register, exit app
        if (!isAuthenticated) {
          return false;
        }
        // If on profile, go back to home
        if (activeScreen === 'profile') {
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
  const [isBooting, setIsBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [homeLaunchIntent, setHomeLaunchIntent] = useState(null);

  useEffect(() => {
    const bootstrap = async () => {
      languageService.loadSavedLanguage();

      const token = await authService.getToken();

      if (token) {
        try {
          const profile = await userService.getMyProfile();
          setCurrentUser(profile);
          setIsAuthenticated(true);
          setIsLocalMode(await authService.isUsingLocalMode());
        } catch (error) {
          const status = error.response?.status;
          const storedUser = await authService.getStoredUser();

          if (status === 401) {
            console.log('[App] Session restore failed with 401, clearing local auth.');
            await authService.logout();
          } else if (status === 503) {
            console.log('[App] Session restore skipped because database is unavailable:', error.response?.data?.error);
            if (storedUser) {
              setCurrentUser(storedUser);
            }
            setIsAuthenticated(true);
            setIsLocalMode(await authService.isUsingLocalMode());
          } else {
            console.log('[App] Session restore skipped because backend is unreachable:', error.message);
            if (storedUser) {
              setCurrentUser(storedUser);
            }
            setIsAuthenticated(true);
            setIsLocalMode(await authService.isUsingLocalMode());
          }
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
    setIsLocalMode(await authService.isUsingLocalMode());
  };

  const handleLogout = async () => {
    await authService.logout();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setAuthMode('login');
    setActiveScreen('home');
    setIsLocalMode(false);
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

    if (activeScreen === 'account') {
      return (
        <ProfileScreen
          user={currentUser}
          onBack={() => setActiveScreen('home')}
          onProfileUpdated={handleProfileUpdated}
          onLogout={handleLogout}
        />
      );
    }

    if (activeScreen === 'allergies' || activeScreen === 'history' || activeScreen === 'medicine-profile') {
      return (
        <MedicineSafetyScreen
          onBack={() => setActiveScreen('home')}
          onLogout={handleLogout}
          initialRoute={
            activeScreen === 'history'
              ? 'history'
              : activeScreen === 'medicine-profile'
                ? 'profile-view'
                : 'home'
          }
        />
      );
    if (activeScreen === 'emotional-support') {
      return <EmotionalSupportNavigator />;
    }

    return (
      <HomeScreen
        user={currentUser}
        isLocalMode={isLocalMode}
        onOpenProfile={() => setActiveScreen('medicine-profile')}
        onOpenAllergies={() => setActiveScreen('allergies')}
        onOpenMedicine={() => setActiveScreen('allergies')}
        onOpenHistory={() => setActiveScreen('history')}
        launchIntent={homeLaunchIntent}
        onOpenProfile={() => setActiveScreen('profile')}
        onOpenEmotionalSupport={() => setActiveScreen('emotional-support')}
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
