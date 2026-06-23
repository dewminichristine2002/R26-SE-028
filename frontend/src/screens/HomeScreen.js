import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Alert, Image, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import RoutineSetupScreen from './RoutineSetupScreen';
import ManualEntryScreen from './ManualEntryScreen';
import MedicineListScreen from './MedicineListScreen';
import MedicineStockScreen from './MedicineStockScreen';
import ScheduleBoardScreen from './ScheduleBoardScreen';
import SafetyCenterScreen from './SafetyCenterScreen';
import ReceiptScanScreen from './ReceiptScanScreen';
import TabletIdentifierScreen from './TabletIdentifierScreen';
import { caregiverAlertService } from '../services/caregiverAlertService';

const elderMedsLogo = require('../../assets/logo.png');

const HomeScreen = ({ user, onOpenProfile, onLogout, launchIntent }) => {
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [activeReminderView, setActiveReminderView] = useState('menu');
  const [largeTextMode, setLargeTextMode] = useState(false);
  const [caregiverAlerts, setCaregiverAlerts] = useState([]);
  const [caregiverUnreadCount, setCaregiverUnreadCount] = useState(0);
  const [caregiverTimeline, setCaregiverTimeline] = useState([]);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [medicineDraft, setMedicineDraft] = useState(null);
  const [medicineDraftQueue, setMedicineDraftQueue] = useState([]);
  const [medicineDraftIndex, setMedicineDraftIndex] = useState(0);
  const [capturedMedicines, setCapturedMedicines] = useState([]);
  const caregiverUnreadCountRef = useRef(0);
  const { t } = useTranslation();

  const toDraftKey = (item) => {
    const name = String(item?.medicineName || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const dose = Number(item?.dosageMg) || 0;
    const qty = Number(item?.totalQuantity) || 0;
    return `${name}|${dose}|${qty}`;
  };

  const removeOneByKey = (list, key) => {
    let removed = false;
    return (list || []).filter((entry) => {
      if (!removed && toDraftKey(entry) === key) {
        removed = true;
        return false;
      }
      return true;
    });
  };

  const menuItems = [
    {
      id: 1,
      label: 'home.reminder',
      title: 'Medicine Reminder',
      subtitle: 'Today schedule, medicine list, stock and safety tools.',
      helper: 'Open',
      icon: '🔔',
      accentColor: '#1f6894',
      backgroundColor: '#f4f9ff',
      borderColor: '#b9d9f2',
    },
    {
      id: 2,
      label: 'home.allergies',
      title: 'Allergy Notes',
      subtitle: 'Keep important allergy information close.',
      helper: 'Soon',
      icon: '⚠️',
      accentColor: '#1f6894',
      backgroundColor: '#f4f9ff',
      borderColor: '#d5eafa',
    },
    {
      id: 3,
      label: 'home.emotions',
      title: 'Mood Check',
      subtitle: 'A simple place to record how you feel.',
      helper: 'Soon',
      icon: '😊',
      accentColor: '#347fa8',
      backgroundColor: '#eef8ff',
      borderColor: '#c9e5f5',
    },
    {
      id: 4,
      label: 'home.dashboard',
      title: 'Health Dashboard',
      subtitle: 'See your care progress in one calm view.',
      helper: 'Soon',
      icon: '📊',
      accentColor: '#2b6f9d',
      backgroundColor: '#f2f8fd',
      borderColor: '#d5eafa',
    },
  ];

  const reminderMenuItems = [
    {
      title: 'Schedule Board',
      subtitle: 'See today medicines',
      helper: 'Today',
      icon: '🗓️',
      accentColor: '#1e6f5c',
      backgroundColor: '#e9f7f1',
      borderColor: '#a8dbc8',
    },
    {
      title: 'Routine Setup',
      subtitle: 'Set meal times',
      helper: 'Times',
      icon: '⏰',
      accentColor: '#2f65a3',
      backgroundColor: '#edf5ff',
      borderColor: '#b9d4f2',
    },
    {
      title: 'Add Medicine',
      subtitle: 'Add new medicine',
      helper: 'Add',
      icon: '💊',
      accentColor: '#8a4a17',
      backgroundColor: '#fff4e8',
      borderColor: '#f0cda8',
    },
    {
      title: 'Medicine List',
      subtitle: 'View medicines',
      helper: 'List',
      icon: '📋',
      accentColor: '#5b4aa0',
      backgroundColor: '#f3efff',
      borderColor: '#cbc0f0',
    },
    {
      title: 'Medicine Stock',
      subtitle: 'Check medicine amount',
      helper: 'Stock',
      icon: '📦',
      accentColor: '#126b7a',
      backgroundColor: '#e9f8fb',
      borderColor: '#a7dce4',
    },
    {
      title: 'Tablet Identifier',
      subtitle: 'Take photo to find name',
      helper: 'Photo',
      icon: 'ID',
      accentColor: '#2b6f9d',
      backgroundColor: '#eef8ff',
      borderColor: '#c9e5f5',
    },
    {
      title: 'Safety Center',
      subtitle: 'See safety alerts',
      helper: 'Safe',
      icon: '🛡️',
      accentColor: '#9b3d47',
      backgroundColor: '#fff0f2',
      borderColor: '#edbdc4',
    },
  ];

  const handleButtonPress = (item) => {
    if (item.label === 'home.reminder') {
      setActiveReminderView('menu');
      setShowReminderMenu(true);
      return;
    }

    Alert.alert(item.title || t(item.label), 'This feature is being prepared for ElderMeds.');
  };

  const handleReminderMenuPress = (menuItem) => {
    if (menuItem === 'Routine Setup') {
      setActiveReminderView('routine-setup');
      return;
    }

    if (menuItem === 'Add Medicine') {
      setActiveReminderView('add-medicine');
      return;
    }

    if (menuItem === 'Scan Pharmacy Receipt') {
      setActiveReminderView('scan-receipt');
      return;
    }

    if (menuItem === 'Medicine List') {
      setActiveReminderView('medicine-list');
      return;
    }

    if (menuItem === 'Medicine Stock') {
      setActiveReminderView('medicine-stock');
      return;
    }

    if (menuItem === 'Tablet Identifier') {
      setActiveReminderView('tablet-identifier');
      return;
    }

    if (menuItem === 'Schedule Board') {
      setActiveReminderView('schedule-board');
      return;
    }

    if (menuItem === 'Safety Center') {
      setActiveReminderView('safety-center');
      return;
    }

    console.log(`Selected ${menuItem}`);
    // TODO: Navigate to selected reminder menu feature
  };

  const textScale = largeTextMode ? 1.15 : 1;
  const reminderTextScale = textScale;
  const isCaregiver = user?.role === 'caregiver';
  const criticalAlerts = caregiverAlerts.filter((item) => !item.is_read);
  const recentAlerts = caregiverAlerts.slice(0, 5);
  const timelineItems = isTimelineExpanded ? caregiverTimeline : caregiverTimeline.slice(0, 4);
  const firstName = String(user?.fullName || '').trim().split(/\s+/)[0] || 'there';
  const todayLabel = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const getTimelineDayKey = (value) => {
    const dateValue = new Date(value || Date.now());
    if (Number.isNaN(dateValue.getTime())) {
      return 'unknown';
    }

    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatTimelineDayLabel = (dayKey) => {
    if (dayKey === 'unknown') {
      return 'Unknown Day';
    }

    const target = new Date(`${dayKey}T00:00:00`);
    const today = new Date();
    const todayKey = getTimelineDayKey(today);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = getTimelineDayKey(yesterday);

    if (dayKey === todayKey) {
      return 'Today';
    }

    if (dayKey === yesterdayKey) {
      return 'Yesterday';
    }

    return target.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const timelineDayGroups = timelineItems.reduce((acc, timelineItem) => {
    const eventDate = timelineItem.event_time || timelineItem.created_at;
    const dayKey = getTimelineDayKey(eventDate);
    const existing = acc.find((group) => group.dayKey === dayKey);
    if (existing) {
      existing.items.push(timelineItem);
      return acc;
    }

    acc.push({
      dayKey,
      items: [timelineItem],
    });
    return acc;
  }, []);

  const formatAlertTime = (value) => {
    if (!value) {
      return '';
    }

    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      return '';
    }

    const diffMs = Date.now() - dateValue.getTime();
    const diffMin = Math.max(1, Math.floor(diffMs / 60000));

    if (diffMin < 60) {
      return `${diffMin}m ago`;
    }

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatClockTime = (value) => {
    if (!value) {
      return '--:--';
    }

    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
      return '--:--';
    }

    return dateValue.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getCaregiverAlertTitle = (alertItem) => {
    const rawTitle = String(alertItem?.title || '').trim();
    const message = String(alertItem?.message || '').toLowerCase();

    if (
      message.includes('please arrange a refill') ||
      message.includes('requested refill') ||
      message.includes('need my')
    ) {
      return 'Refill Alert';
    }

    return rawTitle || 'Caregiver Alert';
  };

  const getTimelineMeta = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'overdose') {
      return { icon: '△', dotStyle: styles.caregiverTimelineDotCritical };
    }

    if (normalized === 'not-taken') {
      return { icon: '△', dotStyle: styles.caregiverTimelineDotWarning };
    }

    if (normalized === 'taken') {
      return { icon: '◉', dotStyle: styles.caregiverTimelineDotGood };
    }

    return { icon: '◌', dotStyle: styles.caregiverTimelineDotNeutral };
  };

  const getTimelineLabel = (entry) => {
    const medicineName = String(entry?.medicine_name || 'Medicine').trim();
    const dosageMg = Number(entry?.dosage_mg);
    const doseText = Number.isFinite(dosageMg) && dosageMg > 0 ? `${dosageMg}mg` : '';
    const title = [medicineName, doseText].filter(Boolean).join(' ');
    const normalized = String(entry?.status || '').toLowerCase();

    if (normalized === 'overdose') {
      return `${title} - Double Dose Detected`;
    }

    if (normalized === 'not-taken') {
      return `${title} - Missed`;
    }

    if (normalized === 'taken') {
      return `${title} - Taken`;
    }

    if (normalized === 'remind') {
      return `${title} - Reminder Pending`;
    }

    return `${title} - Status Updated`;
  };


  useEffect(() => {
    if (!launchIntent || launchIntent.type !== 'schedule-board') {
      return;
    }
    setShowReminderMenu(true);
    setActiveReminderView('schedule-board');
  }, [launchIntent && launchIntent.nonce, launchIntent && launchIntent.type]);

  // Android hardware back button navigation for HomeScreen
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      // If in a subview, go back to main menu
      if (showReminderMenu && activeReminderView !== 'menu') {
        setActiveReminderView('menu');
        return true;
      }
      // If reminder menu open, close it
      if (showReminderMenu) {
        setShowReminderMenu(false);
        return true;
      }
      // Otherwise, let default (handled by App.js)
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [showReminderMenu, activeReminderView]);

  useEffect(() => {
    if (!isCaregiver) {
      setCaregiverAlerts([]);
      setCaregiverUnreadCount(0);
      setCaregiverTimeline([]);
      caregiverUnreadCountRef.current = 0;
      return undefined;
    }

    let mounted = true;

    const loadCaregiverAlerts = async () => {
      try {
        const [alertsResponse, timelineResponse] = await Promise.all([
          caregiverAlertService.getCaregiverAlerts(),
          caregiverAlertService.getCaregiverTimeline(),
        ]);
        if (!mounted) {
          return;
        }

        const alerts = alertsResponse.alerts || [];
        const unreadCount = Number(alertsResponse.unreadCount) || 0;
        const previousUnreadCount = caregiverUnreadCountRef.current;

        setCaregiverAlerts(alerts);
        setCaregiverTimeline(timelineResponse || []);
        setCaregiverUnreadCount(unreadCount);
        caregiverUnreadCountRef.current = unreadCount;

        if (unreadCount > previousUnreadCount) {
          const newestUnread = alerts.find((item) => !item.is_read);
          if (newestUnread?.message) {
            Alert.alert(getCaregiverAlertTitle(newestUnread), newestUnread.message);
          }
        }
      } catch (error) {
        console.log('[HomeScreen] caregiver alerts load failed:', error?.message || error);
      }
    };

    loadCaregiverAlerts();
    const intervalId = setInterval(loadCaregiverAlerts, 10000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [isCaregiver]);

  const handleCaregiverNotificationPress = async () => {
    const unreadAlerts = caregiverAlerts.filter((item) => !item.is_read);
    if (!unreadAlerts.length) {
      Alert.alert('Notifications', 'No unread alerts right now.');
      return;
    }

    try {
      await Promise.all(unreadAlerts.map((item) => caregiverAlertService.markAlertRead(item.id)));
      setCaregiverAlerts((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setCaregiverUnreadCount(0);
      caregiverUnreadCountRef.current = 0;
    } catch (error) {
      console.log('[HomeScreen] caregiver alerts mark read failed:', error?.message || error);
    }
  };

  const handleMarkSingleAlertRead = async (alertId) => {
    try {
      await caregiverAlertService.markAlertRead(alertId);
      setCaregiverAlerts((prev) => prev.map((item) => (item.id === alertId ? { ...item, is_read: true } : item)));
      setCaregiverUnreadCount((prev) => Math.max(0, prev - 1));
      caregiverUnreadCountRef.current = Math.max(0, caregiverUnreadCountRef.current - 1);
    } catch (error) {
      console.log('[HomeScreen] mark single caregiver alert read failed:', error?.message || error);
    }
  };

  if (isCaregiver) {
    return (
      <ScrollView style={styles.caregiverPage} contentContainerStyle={styles.caregiverContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.caregiverTopBar}>
          <View style={styles.caregiverBrandPill}>
            <Image source={elderMedsLogo} style={styles.caregiverBrandLogo} resizeMode="contain" />
          </View>
          <TouchableOpacity
            style={styles.caregiverNotificationButton}
            onPress={handleCaregiverNotificationPress}
            accessibilityRole="button"
            accessibilityLabel="Mark caregiver notifications as read"
            accessibilityHint="Marks unread caregiver alerts as read"
          >
            <Text style={styles.caregiverNotificationIcon}>🔔</Text>
            {caregiverUnreadCount > 0 && (
              <View style={styles.caregiverNotificationBadge}>
                <Text style={styles.caregiverNotificationBadgeText}>{caregiverUnreadCount > 99 ? '99+' : caregiverUnreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.caregiverHeroCard}>
          <View style={styles.caregiverHeroTextWrap}>
            <Text style={styles.caregiverHeroEyebrow}>{todayLabel}</Text>
            <Text style={styles.caregiverHeroTitle}>Caregiver Dashboard</Text>
            <Text style={styles.caregiverHeroSubtitle}>Monitor medicine activity and respond quickly.</Text>
          </View>
          <View style={styles.caregiverHeroBadge}>
            <Text style={styles.caregiverHeroBadgeValue}>{caregiverUnreadCount}</Text>
            <Text style={styles.caregiverHeroBadgeLabel}>Active</Text>
          </View>
        </View>

        <View style={styles.caregiverStatsRow}>
          <View style={styles.caregiverStatCard}>
            <Text style={styles.caregiverStatValue}>{caregiverUnreadCount}</Text>
            <Text style={styles.caregiverStatLabel}>Unread alerts</Text>
          </View>
          <View style={styles.caregiverStatCard}>
            <Text style={styles.caregiverStatValue}>{caregiverTimeline.length}</Text>
            <Text style={styles.caregiverStatLabel}>Timeline events</Text>
          </View>
        </View>

        {!!criticalAlerts.length && (
          <View style={styles.caregiverCriticalCard}>
            <View style={styles.caregiverSectionHeaderRow}>
              <Text style={styles.caregiverSectionTitle}>Immediate Action</Text>
              <Text style={styles.caregiverCriticalCount}>{criticalAlerts.length}</Text>
            </View>
            {criticalAlerts.slice(0, 2).map((alertItem) => (
              <View key={`critical-${alertItem.id}`} style={styles.caregiverCriticalItem}>
                <View style={styles.caregiverCriticalHeader}>
                  <Text style={styles.caregiverCriticalLabel}>{getCaregiverAlertTitle(alertItem)}</Text>
                  <Text style={styles.caregiverCriticalTime}>{formatAlertTime(alertItem.created_at)}</Text>
                </View>
                <Text style={styles.caregiverCriticalMessage}>{alertItem.message}</Text>
                <TouchableOpacity
                  style={styles.caregiverMarkReadButton}
                  onPress={() => handleMarkSingleAlertRead(alertItem.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Mark alert as read"
                >
                  <Text style={styles.caregiverMarkReadText}>Mark read</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.caregiverCard}>
          <View style={styles.caregiverSectionHeaderRow}>
            <Text style={styles.caregiverSectionTitle}>Recent Updates</Text>
            <Text style={styles.caregiverSectionBadge}>{recentAlerts.length}</Text>
          </View>
          {!recentAlerts.length ? (
            <Text style={styles.caregiverEmptyText}>No notifications yet.</Text>
          ) : (
            recentAlerts.map((alertItem) => (
              <View key={`recent-${alertItem.id}`} style={styles.caregiverRecentItem}>
                <View style={styles.caregiverRecentDotWrap}>
                  <View style={[styles.caregiverRecentDot, !alertItem.is_read && styles.caregiverRecentDotUnread]} />
                </View>
                <View style={styles.caregiverRecentContent}>
                  <View style={styles.caregiverRecentTopRow}>
                    <Text style={styles.caregiverRecentTitle}>{getCaregiverAlertTitle(alertItem)}</Text>
                    <Text style={styles.caregiverRecentTime}>{formatAlertTime(alertItem.created_at)}</Text>
                  </View>
                  <Text style={styles.caregiverRecentMessage}>{alertItem.message}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.caregiverCard}>
          <View style={styles.caregiverTimelineHeader}>
            <Text style={styles.caregiverSectionTitle}>Timeline View</Text>
            <TouchableOpacity style={styles.caregiverTimelineToggle} onPress={() => setIsTimelineExpanded((prev) => !prev)}>
              <Text style={styles.caregiverTimelineLink}>{isTimelineExpanded ? 'Minimize' : 'Maximize'}</Text>
            </TouchableOpacity>
          </View>
          {!caregiverTimeline.length ? (
            <Text style={styles.caregiverEmptyText}>No timeline events yet.</Text>
          ) : (
            timelineDayGroups.map((group, groupIndex) => (
              <View key={`timeline-day-${group.dayKey}-${groupIndex}`}>
                <Text style={styles.caregiverTimelineDayLabel}>{formatTimelineDayLabel(group.dayKey)}</Text>
                {group.items.map((timelineItem, index) => {
                  const meta = getTimelineMeta(timelineItem.status);
                  return (
                    <View key={`timeline-${timelineItem.id || `${group.dayKey}-${index}`}`} style={styles.caregiverTimelineItem}>
                      <View style={styles.caregiverTimelineMarkerCol}>
                        {index !== group.items.length - 1 && <View style={styles.caregiverTimelineLine} />}
                        <View style={[styles.caregiverTimelineDotCircle, meta.dotStyle]}>
                          <Text style={styles.caregiverTimelineDotIcon}>{meta.icon}</Text>
                        </View>
                      </View>
                      <View style={styles.caregiverTimelineContent}>
                        <Text style={styles.caregiverTimelineTime}>{formatClockTime(timelineItem.event_time || timelineItem.created_at)}</Text>
                        <Text style={styles.caregiverTimelineText}>{getTimelineLabel(timelineItem)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
          {!isTimelineExpanded && caregiverTimeline.length > 4 && (
            <TouchableOpacity
              style={styles.caregiverTimelineExpandButton}
              onPress={() => setIsTimelineExpanded(true)}
            >
              <Text style={styles.caregiverTimelineExpandButtonText}>Show {caregiverTimeline.length - 4} more</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.caregiverActionRow}>
          <TouchableOpacity style={styles.caregiverProfileButton} onPress={onOpenProfile}>
            <Text style={styles.caregiverProfileButtonText}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.caregiverLogoutButton} onPress={onLogout}>
            <View style={styles.caregiverLogoutIconFrame}>
              <View style={styles.caregiverLogoutDoor} />
              <Text style={styles.caregiverLogoutArrow}>→</Text>
            </View>
            <Text style={styles.caregiverLogoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (showReminderMenu) {
    if (activeReminderView === 'routine-setup') {
      return <RoutineSetupScreen onBackToMenu={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    if (activeReminderView === 'add-medicine') {
      return (
        <ScrollView contentContainerStyle={styles.addMedicineContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.addMedicineHeader}>
            <TouchableOpacity
              style={styles.addMedicineBackButton}
              onPress={() => setActiveReminderView('menu')}
              accessibilityRole="button"
              accessibilityLabel="Back to reminder menu"
            >
              <Text style={styles.addMedicineBackIcon}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.addMedicineTitle, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}>💊 Add Medicine</Text>
            <View style={styles.addMedicineHeaderSpacer} />
          </View>

          <View style={styles.addMedicineHintCard}>
            <View style={styles.addMedicineHintIconWrap}>
              <Text style={styles.addMedicineHintIcon}>➕</Text>
            </View>
            <View style={styles.addMedicineHintTextWrap}>
              <Text style={[styles.addMedicineHintTitle, { fontSize: 24 * textScale, lineHeight: 30 * textScale }]}>Choose how to add</Text>
              <Text style={[styles.addMedicineHintText, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>Pick the easiest way.</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addMedicineOptionCard, styles.addMedicineOptionCardPrimary]}
            onPress={() => setActiveReminderView('scan-receipt')}
            accessibilityRole="button"
            accessibilityLabel="Scan Pharmacy Receipt"
            accessibilityHint="Scan your pharmacy receipt to add medicines"
          >
            <View style={[styles.addMedicineOptionIconWrap, styles.addMedicineOptionIconWrapPrimary]}>
              <Text style={styles.addMedicineOptionIcon}>📷</Text>
            </View>
            <View style={styles.addMedicineOptionTextWrap}>
              <Text style={[styles.addMedicineOptionTitle, { fontSize: 21 * textScale, lineHeight: 27 * textScale }]}>Scan Receipt</Text>
              <Text style={[styles.addMedicineOptionSubtitle, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>Use camera. Fast way.</Text>
            </View>
            <Text style={styles.addMedicineOptionArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addMedicineOptionCard}
            onPress={() => {
              setMedicineDraft(null);
              setMedicineDraftQueue([]);
              setMedicineDraftIndex(0);
              setCapturedMedicines([]);
              setActiveReminderView('manual-entry');
            }}
            accessibilityRole="button"
            accessibilityLabel="Manual Entry"
            accessibilityHint="Type medicine details manually"
          >
            <View style={[styles.addMedicineOptionIconWrap, styles.addMedicineOptionIconWrapManual]}>
              <Text style={styles.addMedicineOptionIcon}>⌨️</Text>
            </View>
            <View style={styles.addMedicineOptionTextWrap}>
              <Text style={[styles.addMedicineOptionTitle, { fontSize: 21 * textScale, lineHeight: 27 * textScale }]}>Type Details</Text>
              <Text style={[styles.addMedicineOptionSubtitle, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>Enter by yourself.</Text>
            </View>
            <Text style={styles.addMedicineOptionArrow}>›</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (activeReminderView === 'manual-entry') {
      const currentDraft = medicineDraftQueue.length
        ? medicineDraftQueue[Math.min(medicineDraftIndex, medicineDraftQueue.length - 1)]
        : medicineDraft;

      return (
        <ManualEntryScreen
          reminderTextScale={reminderTextScale}
          initialData={currentDraft}
          onBack={() => {
            if (capturedMedicines.length) {
              setMedicineDraftQueue([]);
              setMedicineDraftIndex(0);
              setActiveReminderView('scan-receipt');
              return;
            }

            setMedicineDraftQueue([]);
            setMedicineDraftIndex(0);
            setActiveReminderView('add-medicine');
          }}
          onSaved={(savedDraft) => {
            const activeDraft = medicineDraftQueue.length
              ? medicineDraftQueue[Math.min(medicineDraftIndex, medicineDraftQueue.length - 1)]
              : medicineDraft;
            const savedKey = toDraftKey(savedDraft || activeDraft);

            setCapturedMedicines((prev) => removeOneByKey(prev, savedKey));

            if (medicineDraftQueue.length) {
              const nextQueue = removeOneByKey(medicineDraftQueue, savedKey);
              setMedicineDraftQueue(nextQueue);

              if (nextQueue.length) {
                const nextIndex = Math.min(medicineDraftIndex, nextQueue.length - 1);
                setMedicineDraftIndex(nextIndex);
                setMedicineDraft(nextQueue[nextIndex]);
                return false;
              }

              setMedicineDraftIndex(0);
              setMedicineDraft(null);
              return true;
            }

            return true;
          }}
        />
      );
    }

    if (activeReminderView === 'scan-receipt') {
      return (
        <ReceiptScanScreen
          reminderTextScale={reminderTextScale}
          onBack={() => setActiveReminderView('add-medicine')}
          initialDetectedMedicines={capturedMedicines}
          onCapturedListChange={(list) => {
            const next = Array.isArray(list) ? list : [];
            setCapturedMedicines(next);
          }}
          onDetected={(detectedFields) => {
            setMedicineDraft(detectedFields || null);
            setMedicineDraftQueue([]);
            setMedicineDraftIndex(0);
            setCapturedMedicines((prev) => (prev.length ? prev : (detectedFields ? [detectedFields] : [])));
            setActiveReminderView('manual-entry');
          }}
          onDetectedMany={(detectedList) => {
            const list = Array.isArray(detectedList) ? detectedList : [];
            if (!list.length) {
              return;
            }

            setCapturedMedicines(list);
            setMedicineDraftQueue(list);
            setMedicineDraftIndex(0);
            setMedicineDraft(list[0]);
            setActiveReminderView('manual-entry');
          }}
        />
      );
    }

    if (activeReminderView === 'medicine-list') {
      return <MedicineListScreen onBack={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    if (activeReminderView === 'medicine-stock') {
      return <MedicineStockScreen onBack={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    if (activeReminderView === 'tablet-identifier') {
      return <TabletIdentifierScreen onBack={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    if (activeReminderView === 'schedule-board') {
      return <ScheduleBoardScreen user={user} onBack={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    if (activeReminderView === 'safety-center') {
      return <SafetyCenterScreen onBack={() => setActiveReminderView('menu')} reminderTextScale={reminderTextScale} />;
    }

    return (
      <ScrollView contentContainerStyle={styles.reminderContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.reminderTopBar}>
          <View style={styles.reminderTopLeft}>
            <View style={styles.reminderTopTitleWrap}>
              <View style={styles.reminderBrandPill}>
                <Image source={elderMedsLogo} style={styles.reminderBrandLogo} resizeMode="contain" />
              </View>
              <Text style={styles.reminderTopLabel}>Reminder Menu</Text>
            </View>
          </View>
          <View style={styles.reminderTopActions}>
            <TouchableOpacity
              style={styles.reminderProfileButton}
              onPress={onOpenProfile}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              accessibilityHint="Opens your user profile"
            >
              <Text style={styles.reminderProfileButtonIcon}>👤</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reminderHomeButton}
              onPress={() => {
                setShowReminderMenu(false);
                setActiveReminderView('menu');
              }}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
              accessibilityHint="Returns to the main home menu"
            >
              <Text style={styles.reminderHomeButtonIcon}>🏠</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.reminderHeaderCard}>
          <View style={styles.reminderHeaderIconWrap}>
            <Text style={styles.reminderHeaderIcon}>🔔</Text>
          </View>
          <View style={styles.reminderHeaderTextWrap}>
            <Text style={[styles.reminderTitle, { fontSize: 34 * textScale, lineHeight: 40 * textScale }]}>
              Medicine{`\n`}Reminder
            </Text>
          </View>
        </View>

        <View style={styles.reminderSectionHeader}>
          <View style={styles.reminderSectionCopy}>
            <Text style={styles.reminderInfoText}>Choose Action</Text>
          </View>
          <View style={styles.textModeRow}>
            <Text style={styles.textModeLabel}>Text</Text>
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

        <View style={styles.reminderButtonList}>
          {reminderMenuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.reminderButton,
                {
                  backgroundColor: item.backgroundColor,
                  borderColor: item.borderColor,
                },
              ]}
              activeOpacity={0.86}
              onPress={() => handleReminderMenuPress(item.title)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityHint={item.subtitle}
            >
              <View style={[styles.reminderButtonIconWrap, { backgroundColor: item.accentColor }]}>
                <Text style={styles.reminderButtonIcon}>{item.icon}</Text>
              </View>
              <View style={styles.reminderButtonTextWrap}>
                <View style={styles.reminderButtonTitleRow}>
                  <Text style={[styles.reminderButtonText, { fontSize: 21 * textScale }]}>{item.title}</Text>
                </View>
                <Text style={[styles.reminderButtonSubText, { fontSize: 15 * textScale, lineHeight: 21 * textScale }]}>
                  {item.subtitle}
                </Text>
              </View>
              <View style={[styles.reminderButtonArrowWrap, { borderColor: item.borderColor }]}>
                <Text style={[styles.reminderButtonArrow, { color: item.accentColor }]}>›</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeTopBar}>
        <Image source={elderMedsLogo} style={styles.homeBrandLogo} resizeMode="contain" />
        <View style={styles.homeTopActions}>
          <TouchableOpacity
            style={styles.homeTopProfileButton}
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            accessibilityHint="Opens your ElderMeds profile"
          >
            <Text style={styles.homeTopProfileIcon}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homeTopLogoutButton}
            onPress={onLogout}
            accessibilityRole="button"
            accessibilityLabel="Logout"
            accessibilityHint="Signs out from ElderMeds"
          >
            <View style={styles.homeTopLogoutIconFrame}>
              <View style={styles.homeTopLogoutDoor} />
              <Text style={styles.homeTopLogoutArrow}>→</Text>
            </View>
            <Text style={styles.homeTopLogoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.homeHeroCard}>
        <View style={styles.homeHeroTextWrap}>
          <Text style={styles.homeDateText}>{todayLabel}</Text>
          <Text style={styles.homeHeroTitle}>Good day, {firstName}</Text>
          <Text style={styles.homeHeroSubtitle}>Your medicine care is ready when you are.</Text>
        </View>
        <View style={styles.homeHeroBadge}>
          <Text style={styles.homeHeroBadgeIcon}>❤</Text>
          <Text style={styles.homeHeroBadgeText}>Care</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.homePrimaryAction}
        activeOpacity={0.88}
        onPress={() => handleButtonPress(menuItems[0])}
        accessibilityRole="button"
        accessibilityLabel="Open medicine reminder"
        accessibilityHint="Shows schedule, routine, medicine list, stock and safety options"
      >
        <View style={styles.homePrimaryIconWrap}>
          <Text style={styles.homePrimaryIcon}>🔔</Text>
        </View>
        <View style={styles.homePrimaryTextWrap}>
          <Text style={styles.homePrimaryEyebrow}>Main action</Text>
          <Text style={styles.homePrimaryTitle}>Medicine Reminder</Text>
          <Text style={styles.homePrimarySubtitle}>Open today schedule and medicine tools.</Text>
        </View>
        <View style={styles.homePrimaryArrowWrap}>
          <Text style={styles.homePrimaryArrow}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.homeSectionHeader}>
        <View>
          <Text style={styles.homeSectionTitle}>Quick Care</Text>
          <Text style={styles.homeSectionSubtitle}>Large buttons for easy tapping</Text>
        </View>
      </View>

      <View style={styles.homeActionList}>
        {menuItems.slice(1).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.homeActionCard,
              {
                backgroundColor: item.backgroundColor,
                borderColor: item.borderColor,
              },
            ]}
            activeOpacity={0.88}
            onPress={() => handleButtonPress(item)}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={item.subtitle}
          >
            <View style={[styles.homeActionIconWrap, { backgroundColor: item.accentColor }]}>
              <Text style={styles.homeActionIcon}>{item.icon}</Text>
            </View>
            <View style={styles.homeActionTextWrap}>
              <Text style={styles.homeActionTitle}>{item.title}</Text>
              <Text style={styles.homeActionSubtitle}>{item.subtitle}</Text>
            </View>
            <Text style={[styles.homeActionHelper, { color: item.accentColor }]}>{item.helper}</Text>
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
  homeScroll: {
    flex: 1,
    backgroundColor: '#eaf4ff',
  },
  homeContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 30,
  },
  homeTopBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  homeBrandLogo: {
    width: 132,
    height: 40,
    flexShrink: 1,
  },
  homeTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  homeTopProfileButton: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: '#fbfdff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  homeTopProfileIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
  homeTopLogoutButton: {
    minWidth: 104,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#fbfdff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  homeTopLogoutIconFrame: {
    width: 24,
    height: 24,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  homeTopLogoutDoor: {
    position: 'absolute',
    left: 2,
    width: 11,
    height: 18,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#1f6894',
    borderRightWidth: 0,
  },
  homeTopLogoutArrow: {
    position: 'absolute',
    right: 0,
    color: '#1f6894',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  homeTopLogoutText: {
    color: '#1f6894',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  homeHeroCard: {
    minHeight: 150,
    borderRadius: 24,
    backgroundColor: '#1f6894',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  homeHeroTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  homeDateText: {
    color: '#eaf5ff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    marginBottom: 6,
  },
  homeHeroTitle: {
    color: '#ffffff',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    marginBottom: 8,
  },
  homeHeroSubtitle: {
    color: '#f3f9ff',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  homeHeroBadge: {
    width: 78,
    minHeight: 92,
    borderRadius: 24,
    backgroundColor: '#fbfdff',
    borderWidth: 2,
    borderColor: '#d5eafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeHeroBadgeIcon: {
    color: '#1f6894',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  homeHeroBadgeText: {
    color: '#1f6894',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  homePrimaryAction: {
    minHeight: 118,
    borderRadius: 22,
    backgroundColor: '#fbfdff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  homePrimaryIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: '#1f6894',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  homePrimaryIcon: {
    fontSize: 32,
    lineHeight: 36,
  },
  homePrimaryTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  homePrimaryEyebrow: {
    color: '#4c6d82',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  homePrimaryTitle: {
    color: '#12354d',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  homePrimarySubtitle: {
    color: '#4c6d82',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 5,
  },
  homePrimaryArrowWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eaf4ff',
    borderWidth: 1,
    borderColor: '#b9d9f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homePrimaryArrow: {
    color: '#1f6894',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
  },
  homeSectionHeader: {
    marginBottom: 12,
  },
  homeSectionTitle: {
    color: '#12354d',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  homeSectionSubtitle: {
    color: '#4c6d82',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 2,
  },
  homeActionList: {
    marginBottom: 4,
  },
  homeActionCard: {
    minHeight: 102,
    borderRadius: 20,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  homeActionIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  homeActionIcon: {
    fontSize: 28,
    lineHeight: 32,
  },
  homeActionTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  homeActionTitle: {
    color: '#12354d',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  homeActionSubtitle: {
    color: '#4c6d82',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  homeActionHelper: {
    minWidth: 46,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '900',
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
    backgroundColor: '#f7efe4',
    paddingTop: 22,
    paddingBottom: 34,
    paddingHorizontal: 16,
    position: 'relative',
  },
  caregiverPage: {
    flex: 1,
    backgroundColor: '#eaf4ff',
  },
  caregiverContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 30,
    backgroundColor: '#eaf4ff',
  },
  caregiverTopBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  caregiverBrandPill: {
    minHeight: 50,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  caregiverBrandLogo: {
    width: 132,
    height: 40,
  },
  caregiverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  caregiverNotificationButton: {
    width: 54,
    height: 54,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  caregiverNotificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#dd4d4d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  caregiverNotificationBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  caregiverNotificationIcon: {
    fontSize: 24,
    lineHeight: 28,
  },
  caregiverHeroCard: {
    minHeight: 156,
    borderRadius: 24,
    backgroundColor: '#1f6894',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  caregiverHeroTextWrap: {
    flex: 1,
    paddingRight: 14,
  },
  caregiverHeroEyebrow: {
    color: '#d8ecfb',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    marginBottom: 6,
  },
  caregiverHeroTitle: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    marginBottom: 8,
  },
  caregiverHeroSubtitle: {
    color: '#eef8ff',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  caregiverHeroBadge: {
    width: 86,
    minHeight: 100,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#d5eafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverHeroBadgeValue: {
    color: '#1f6894',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
  },
  caregiverHeroBadgeLabel: {
    color: '#4c6d82',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  caregiverStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  caregiverStatCard: {
    width: '48.5%',
    minHeight: 88,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  caregiverStatValue: {
    color: '#1f6894',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  caregiverStatLabel: {
    color: '#4c6d82',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  caregiverCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#d5eafa',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  caregiverCardTitle: {
    color: '#4c6d82',
    fontSize: 13,
    marginBottom: 6,
  },
  caregiverCardValue: {
    fontSize: 20,
    color: '#0a4b70',
    fontWeight: '700',
  },
  caregiverCardSubValue: {
    marginTop: 4,
    fontSize: 14,
    color: '#3f6076',
  },
  caregiverInfoStrip: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caregiverInfoTitle: {
    fontSize: 14,
    color: '#2d3c49',
    fontWeight: '700',
  },
  caregiverInfoBadge: {
    backgroundColor: '#e9f1ff',
    color: '#2161a8',
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  caregiverSectionTitle: {
    fontSize: 17,
    lineHeight: 23,
    color: '#12354d',
    fontWeight: '900',
  },
  caregiverSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  caregiverSectionBadge: {
    minWidth: 34,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#eaf4ff',
    color: '#1f6894',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  caregiverCriticalCount: {
    minWidth: 34,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ffe7eb',
    color: '#b0293f',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  caregiverCriticalCard: {
    backgroundColor: '#fff8f9',
    borderColor: '#f0c7cf',
    borderWidth: 2,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#b71c1c',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  caregiverCriticalItem: {
    borderLeftColor: '#d64054',
    borderLeftWidth: 4,
    paddingLeft: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  caregiverCriticalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  caregiverCriticalLabel: {
    color: '#b0293f',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
    flex: 1,
    paddingRight: 10,
  },
  caregiverCriticalTime: {
    color: '#8e5a63',
    fontSize: 12,
    fontWeight: '800',
  },
  caregiverCriticalMessage: {
    color: '#4a2d33',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  caregiverMarkReadButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f0c7cf',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverMarkReadText: {
    color: '#b0293f',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  caregiverRecentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#edf5fc',
  },
  caregiverRecentDotWrap: {
    width: 22,
    alignItems: 'center',
    paddingTop: 5,
  },
  caregiverRecentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#c8d7e3',
  },
  caregiverRecentDotUnread: {
    backgroundColor: '#1f6894',
  },
  caregiverRecentContent: {
    flex: 1,
    marginLeft: 8,
  },
  caregiverRecentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  caregiverRecentTitle: {
    color: '#12354d',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
    flexShrink: 1,
    marginRight: 8,
  },
  caregiverRecentTime: {
    color: '#6f8292',
    fontSize: 12,
    fontWeight: '800',
  },
  caregiverRecentMessage: {
    color: '#4c6d82',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  caregiverEmptyText: {
    color: '#4c6d82',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  caregiverTimelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caregiverTimelineDayLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: '#4c6d82',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  caregiverTimelineToggle: {
    minHeight: 36,
    borderRadius: 14,
    backgroundColor: '#eaf4ff',
    borderWidth: 1,
    borderColor: '#b9d9f2',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverTimelineLink: {
    color: '#1f6894',
    fontSize: 12,
    fontWeight: '900',
  },
  caregiverTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  caregiverTimelineMarkerCol: {
    width: 28,
    alignItems: 'center',
    position: 'relative',
  },
  caregiverTimelineLine: {
    position: 'absolute',
    top: 22,
    width: 2,
    bottom: -8,
    backgroundColor: '#d5eafa',
  },
  caregiverTimelineDotCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  caregiverTimelineDotIcon: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  caregiverTimelineDotCritical: {
    backgroundColor: '#e14c5f',
  },
  caregiverTimelineDotWarning: {
    backgroundColor: '#ef7a3a',
  },
  caregiverTimelineDotGood: {
    backgroundColor: '#2fbe67',
  },
  caregiverTimelineDotNeutral: {
    backgroundColor: '#4f8dd5',
  },
  caregiverTimelineContent: {
    flex: 1,
    paddingBottom: 12,
  },
  caregiverTimelineTime: {
    color: '#1f6894',
    fontSize: 12,
    fontWeight: '900',
  },
  caregiverTimelineText: {
    color: '#12354d',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  caregiverTimelineExpandButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#eaf4ff',
    borderWidth: 1,
    borderColor: '#b9d9f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverTimelineExpandButtonText: {
    color: '#1f6894',
    fontSize: 13,
    fontWeight: '900',
  },
  caregiverActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  caregiverProfileButton: {
    width: '48.5%',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#1f6894',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  caregiverProfileButtonText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  caregiverLogoutButton: {
    width: '48.5%',
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  caregiverLogoutIconFrame: {
    width: 24,
    height: 24,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  caregiverLogoutDoor: {
    position: 'absolute',
    left: 2,
    width: 11,
    height: 18,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: '#1f6894',
    borderRightWidth: 0,
  },
  caregiverLogoutArrow: {
    position: 'absolute',
    right: 0,
    color: '#1f6894',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  caregiverLogoutButtonText: {
    color: '#1f6894',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  reminderTopBar: {
    minHeight: 54,
    marginBottom: 14,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderTopLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  reminderTopTitleWrap: {
    flex: 1,
  },
  reminderBrandPill: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 18,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#eadcca',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  reminderBrandLogo: {
    width: 126,
    height: 34,
  },
  reminderTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderProfileButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 2,
    borderColor: '#a8dbc8',
    shadowColor: '#17382f',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  reminderProfileButtonIcon: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
  },
  reminderTopLabel: {
    marginTop: 2,
    fontSize: 24,
    lineHeight: 30,
    color: '#2d241d',
    fontWeight: '800',
  },
  reminderHomeButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f4cf75',
    shadowColor: '#17382f',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  reminderHomeButtonIcon: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
  },
  reminderHeaderCard: {
    width: '100%',
    minHeight: 126,
    borderRadius: 24,
    backgroundColor: '#2f5d50',
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#f4cf75',
    shadowColor: '#20382f',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  reminderHeaderIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#f8d978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#fff4c6',
  },
  reminderHeaderIcon: {
    fontSize: 36,
  },
  reminderHeaderTextWrap: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
    color: '#ffffff',
  },
  reminderSectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderSectionCopy: {
    flex: 1,
    paddingRight: 10,
  },
  textModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textModeLabel: {
    marginRight: 8,
    color: '#5e5045',
    fontSize: 14,
    fontWeight: '800',
  },
  textModeButton: {
    minWidth: 44,
    height: 38,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#d8c9b7',
  },
  textModeButtonActive: {
    backgroundColor: '#2f5d50',
    borderColor: '#2f5d50',
  },
  textModeButtonText: {
    color: '#5e5045',
    fontWeight: '900',
    fontSize: 14,
  },
  textModeButtonTextActive: {
    color: '#ffffff',
  },
  reminderInfoText: {
    fontSize: 21,
    lineHeight: 26,
    color: '#2d241d',
    fontWeight: '900',
    letterSpacing: 0,
  },
  reminderButtonList: {
    width: '100%',
  },
  reminderButton: {
    borderRadius: 18,
    minHeight: 104,
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#5c4a39',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  reminderButtonIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  reminderButtonIcon: {
    fontSize: 27,
  },
  reminderButtonTextWrap: {
    flex: 1,
    paddingRight: 6,
  },
  reminderButtonTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  reminderButtonText: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#24352f',
    marginRight: 8,
  },
  reminderButtonSubText: {
    marginTop: 7,
    fontSize: 15,
    lineHeight: 21,
    color: '#4d473f',
    fontWeight: '700',
  },
  reminderButtonArrowWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderButtonArrow: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
  },
  addMedicineContainer: {
    flexGrow: 1,
    backgroundColor: '#f7efe4',
    paddingTop: 26,
    paddingHorizontal: 14,
    paddingBottom: 30,
  },
  addMedicineHeader: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: '#2f5d50',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#f4cf75',
    marginBottom: 14,
    shadowColor: '#20382f',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  addMedicineBackButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff4c6',
  },
  addMedicineBackIcon: {
    fontSize: 32,
    lineHeight: 36,
    color: '#2f5d50',
    marginTop: -3,
    fontWeight: '900',
  },
  addMedicineTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: '#ffffff',
  },
  addMedicineHeaderSpacer: {
    width: 46,
    height: 46,
  },
  addMedicineHintCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#eadcca',
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addMedicineHintIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 19,
    backgroundColor: '#f8d978',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addMedicineHintIcon: {
    fontSize: 27,
  },
  addMedicineHintTextWrap: {
    flex: 1,
  },
  addMedicineHintTitle: {
    fontSize: 24,
    lineHeight: 30,
    color: '#2d241d',
    fontWeight: '900',
  },
  addMedicineHintText: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 21,
    color: '#74665b',
    fontWeight: '700',
  },
  addMedicineOptionCard: {
    minHeight: 108,
    backgroundColor: '#f3efff',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#cbc0f0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#6b4b2d',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  addMedicineOptionCardPrimary: {
    borderColor: '#a8dbc8',
    backgroundColor: '#e9f7f1',
  },
  addMedicineOptionIconWrap: {
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: '#5b4aa0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  addMedicineOptionIconWrapPrimary: {
    backgroundColor: '#1e6f5c',
  },
  addMedicineOptionIconWrapManual: {
    backgroundColor: '#5b4aa0',
  },
  addMedicineOptionIcon: {
    fontSize: 29,
  },
  addMedicineOptionTextWrap: {
    flex: 1,
  },
  addMedicineOptionTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    color: '#24352f',
  },
  addMedicineOptionSubtitle: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
    color: '#4d473f',
    fontWeight: '700',
  },
  addMedicineOptionArrow: {
    width: 40,
    fontSize: 32,
    lineHeight: 36,
    color: '#2f5d50',
    fontWeight: '900',
    textAlign: 'right',
  },
});

export default HomeScreen;
