import React, { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from './src/i18n/config';
import { languageService } from './src/services/languageService';
import HomeScreen from './src/screens/HomeScreen';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import MedicineSafetyScreen from './src/screens/MedicineSafetyScreen';
import { authService } from './src/services/authService';
import { userService } from './src/services/userService';

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);
  const [isLocalMode, setIsLocalMode] = useState(false);

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

  const handleLoginSuccess = async (user) => {
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
    }

    return (
      <HomeScreen
        user={currentUser}
        isLocalMode={isLocalMode}
        onOpenProfile={() => setActiveScreen('medicine-profile')}
        onOpenAllergies={() => setActiveScreen('allergies')}
        onOpenMedicine={() => setActiveScreen('allergies')}
        onOpenHistory={() => setActiveScreen('history')}
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
