import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import RoutineSetupScreen from './RoutineSetupScreen';

const HomeScreen = ({ user, onOpenProfile, onLogout }) => {
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [activeReminderView, setActiveReminderView] = useState('menu');
  const [largeTextMode, setLargeTextMode] = useState(false);
  const { t } = useTranslation();

  const menuItems = [
    { id: 1, label: 'home.reminder', icon: '🔔' },
    { id: 2, label: 'home.allergies', icon: '⚠️' },
    { id: 3, label: 'home.emotions', icon: '😊' },
    { id: 4, label: 'home.dashboard', icon: '📊' },
  ];

  const reminderMenuItems = [
    { title: 'Routine Setup', subtitle: 'Create daily reminder times', icon: '⏰' },
    { title: 'Schedule Board', subtitle: 'View today and weekly plans', icon: '🗓️' },
    { title: 'Add Medicine', subtitle: 'Register a new medication', icon: '💊' },
    { title: 'Medicine List', subtitle: 'See all active medicines', icon: '📋' },
    { title: 'Medicine Stock', subtitle: 'Track remaining quantities', icon: '📦' },
    { title: 'Safety Center', subtitle: 'Warnings and safe-use tips', icon: '🛡️' },
  ];

  const handleButtonPress = (item) => {
    if (item.label === 'home.reminder') {
      setActiveReminderView('menu');
      setShowReminderMenu(true);
      return;
    }

    console.log(`Navigating to ${item.label}`);
    // TODO: Navigate to the respective screen
  };

  const handleReminderMenuPress = (menuItem) => {
    if (menuItem === 'Routine Setup') {
      setActiveReminderView('routine-setup');
      return;
    }

    console.log(`Selected ${menuItem}`);
    // TODO: Navigate to selected reminder menu feature
  };

  const textScale = largeTextMode ? 1.15 : 1;

  if (showReminderMenu) {
    if (activeReminderView === 'routine-setup') {
      return <RoutineSetupScreen onBackToMenu={() => setActiveReminderView('menu')} />;
    }

    return (
      <ScrollView contentContainerStyle={styles.reminderContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobBottom} />

        <View style={styles.reminderHeaderCard}>
          <Text style={styles.reminderEyebrow}>ElderMeds Planner</Text>
          <Text style={[styles.reminderTitle, { fontSize: 36 * textScale, lineHeight: 42 * textScale }]}>
            Intelligent{`\n`}Medication Reminder
          </Text>
          <Text style={styles.reminderSubtitle}>
            Keep routines simple. Pick an action below to manage reminders.
          </Text>

          <View style={styles.textModeRow}>
            <Text style={styles.textModeLabel}>Text Size</Text>
            <TouchableOpacity
              style={[styles.textModeButton, !largeTextMode && styles.textModeButtonActive]}
              onPress={() => setLargeTextMode(false)}
              accessibilityRole="button"
              accessibilityLabel="Normal text size"
              accessibilityHint="Sets regular text size for this page"
            >
              <Text style={[styles.textModeButtonText, !largeTextMode && styles.textModeButtonTextActive]}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.textModeButton, largeTextMode && styles.textModeButtonActive]}
              onPress={() => setLargeTextMode(true)}
              accessibilityRole="button"
              accessibilityLabel="Large text size"
              accessibilityHint="Makes menu text larger and easier to read"
            >
              <Text style={[styles.textModeButtonText, largeTextMode && styles.textModeButtonTextActive]}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.reminderInfoStrip}>
          <Text style={styles.reminderInfoText}>Quick Actions</Text>
          <Text style={styles.reminderInfoBadge}>{reminderMenuItems.length} options</Text>
        </View>

        <View style={styles.reminderButtonList}>
          {reminderMenuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.reminderButton}
              activeOpacity={0.86}
              onPress={() => handleReminderMenuPress(item.title)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityHint={item.subtitle}
            >
              <View style={styles.reminderButtonIconWrap}>
                <Text style={styles.reminderButtonIcon}>{item.icon}</Text>
              </View>
              <View style={styles.reminderButtonTextWrap}>
                <Text style={[styles.reminderButtonText, { fontSize: 20 * textScale }]}>{item.title}</Text>
                <Text style={[styles.reminderButtonSubText, { fontSize: 13 * textScale }]}>{item.subtitle}</Text>
              </View>
              <Text style={styles.reminderButtonArrow}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            setShowReminderMenu(false);
            setActiveReminderView('menu');
          }}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          accessibilityHint="Returns to the main home menu"
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{t('home.title')}</Text>
      <Text style={styles.welcome}>{t('home.welcome')}</Text>
      <Text style={styles.userName}>Signed in as {user?.fullName || 'User'}</Text>

      <View style={styles.quickActionRow}>
        <TouchableOpacity style={styles.profileButton} onPress={onOpenProfile}>
          <Text style={styles.profileButtonText}>My Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.button}
            onPress={() => handleButtonPress(item)}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.buttonLabel}>{t(item.label)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  welcome: {
    fontSize: 16,
    color: '#666',
    marginBottom: 6,
  },
  userName: {
    fontSize: 14,
    color: '#1f6894',
    fontWeight: '600',
    marginBottom: 12,
  },
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  profileButton: {
    flex: 1,
    backgroundColor: '#1f6894',
    borderRadius: 10,
    paddingVertical: 10,
    marginRight: 8,
    alignItems: 'center',
  },
  profileButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  logoutButton: {
    flex: 1,
    backgroundColor: '#dd4d4d',
    borderRadius: 10,
    paddingVertical: 10,
    marginLeft: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  button: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  icon: {
    fontSize: 40,
    marginBottom: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    textAlign: 'center',
  },
  reminderContainer: {
    flexGrow: 1,
    backgroundColor: '#edf4fb',
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 18,
    position: 'relative',
  },
  backgroundBlobTop: {
    position: 'absolute',
    top: -110,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#bfe9ff',
  },
  backgroundBlobBottom: {
    position: 'absolute',
    bottom: -120,
    left: -95,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#cde4ff',
  },
  reminderHeaderCard: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 18,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  reminderEyebrow: {
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#2c79a9',
    fontWeight: '700',
    marginBottom: 8,
  },
  reminderTitle: {
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 42,
    color: '#0a4b70',
  },
  reminderSubtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    color: '#4c6d82',
  },
  textModeRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textModeLabel: {
    marginRight: 10,
    color: '#355f7a',
    fontSize: 13,
    fontWeight: '600',
  },
  textModeButton: {
    minWidth: 42,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#eef6fc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#d5e9f9',
  },
  textModeButtonActive: {
    backgroundColor: '#1f6894',
    borderColor: '#1f6894',
  },
  textModeButtonText: {
    color: '#3e637b',
    fontWeight: '700',
    fontSize: 13,
  },
  textModeButtonTextActive: {
    color: '#ffffff',
  },
  reminderInfoStrip: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#d8edff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reminderInfoText: {
    fontSize: 13,
    color: '#2f5f80',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  reminderInfoBadge: {
    fontSize: 12,
    color: '#16486a',
    fontWeight: '700',
    backgroundColor: '#eef7ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  reminderButtonList: {
    width: '100%',
  },
  reminderButton: {
    backgroundColor: '#8ad0f7',
    borderRadius: 20,
    minHeight: 88,
    marginBottom: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#a8dcfb',
    shadowColor: '#175b8d',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  reminderButtonIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#edf8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reminderButtonIcon: {
    fontSize: 20,
  },
  reminderButtonTextWrap: {
    flex: 1,
    paddingRight: 6,
  },
  reminderButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#083350',
  },
  reminderButtonSubText: {
    marginTop: 2,
    fontSize: 13,
    color: '#255574',
  },
  reminderButtonArrow: {
    fontSize: 28,
    color: '#1b5f88',
    marginLeft: 10,
    marginBottom: 2,
  },
  backButton: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    shadowColor: '#175b8d',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  backButtonText: {
    fontSize: 16,
    color: '#1e4f72',
    fontWeight: '600',
  },
});

export default HomeScreen;
