import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, useWindowDimensions } from 'react-native';
import { Alert, View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HeaderAccountActions from '../components/HeaderAccountActions';
import { useTranslation } from '../i18n/useTranslation';

import RoutineSetupScreen from './RoutineSetupScreen';
import ManualEntryScreen from './ManualEntryScreen';
import MedicineListScreen from './MedicineListScreen';
import MedicineStockScreen from './MedicineStockScreen';
import TabletIdentifierScreen from './TabletIdentifierScreen';
import ScheduleBoardScreen from './ScheduleBoardScreen';
import SafetyCenterScreen from './SafetyCenterScreen';
import ReceiptScanScreen from './ReceiptScanScreen';
import { caregiverAlertService } from '../services/caregiverAlertService';
import { medicationService } from '../services/medicationService';

const HomeScreen = ({ user, isLocalMode, initialSection = 'home', onOpenAllergies, onOpenMedicine, onOpenHistory, onOpenEmotionalSupport, onOpenDashboard, onOpenQuickCare, onOpenAssistant, launchIntent, onLaunchIntentConsumed, onSectionChange }) => {
  const { width: screenWidth } = useWindowDimensions();
  const [showReminderMenu, setShowReminderMenu] = useState(initialSection === 'medicines');
  useEffect(() => {
    onSectionChange?.(showReminderMenu ? 'medicines' : 'home');
  }, [showReminderMenu, onSectionChange]);
  const [activeReminderView, setActiveReminderView] = useState('menu');
  const [largeTextMode, setLargeTextMode] = useState(false);
  const [caregiverAlerts, setCaregiverAlerts] = useState([]);
  const [caregiverUnreadCount, setCaregiverUnreadCount] = useState(0);
  const [caregiverAlertStatus, setCaregiverAlertStatus] = useState('loading');
  const [caregiverTimeline, setCaregiverTimeline] = useState([]);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [medicineDraft, setMedicineDraft] = useState(null);
  const [medicineDraftQueue, setMedicineDraftQueue] = useState([]);
  const [medicineDraftIndex, setMedicineDraftIndex] = useState(0);
  const [capturedMedicines, setCapturedMedicines] = useState([]);
  const [homeMedicines, setHomeMedicines] = useState({ status: 'loading', count: 0 });
  const [isRefreshingHome, setIsRefreshingHome] = useState(false);
  const caregiverUnreadCountRef = useRef(0);
  const caregiverAlertsLoadedRef = useRef(false);
  const homeMedicinesRequestRef = useRef(0);
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
      label: 'Reminder',
      icon: '\u{1F514}',
      cardColor: '#e3f8ee',
      borderColor: '#b8ead6',
      iconBg: '#168464',
      arrowColor: '#168464',
    },
    {
      id: 2,
      label: 'Allergy',
      icon: '\u26A0\uFE0F',
      cardColor: '#fff7ed',
      borderColor: '#f3dcbf',
      iconBg: '#985111',
      arrowColor: '#985111',
    },
    {
      id: 3,
      label: 'Emotions',
      icon: '\u{1F60A}',
      cardColor: '#f3edff',
      borderColor: '#dccff6',
      iconBg: '#5b3ca4',
      arrowColor: '#5b3ca4',
    },
    {
      id: 4,
      label: 'Dashboard',
      icon: '\u{1F4CA}',
      cardColor: '#eaf7ff',
      borderColor: '#cae3f2',
      iconBg: '#2576a6',
      arrowColor: '#2576a6',
    },
    {
      id: 5,
      label: 'Quick Care',
      icon: '\u{1F49A}',
      cardColor: '#fff1f4',
      borderColor: '#efccd3',
      iconBg: '#a93447',
      arrowColor: '#a93447',
    },
  ];

  const reminderMenuItems = [
    {
      title: 'Schedule Board',
      subtitle: 'See today medicines',
      icon: '\u{1F5D3}\uFE0F',
      cardColor: '#e3f8ee',
      borderColor: '#b8ead6',
      iconBg: '#168464',
      arrowColor: '#168464',
    },
    {
      title: 'Routine Setup',
      subtitle: 'Set meal times',
      icon: '\u23F0',
      cardColor: '#eaf6ff',
      borderColor: '#cae1f5',
      iconBg: '#256da7',
      arrowColor: '#256da7',
    },
    {
      title: 'Add Medicine',
      subtitle: 'Add new medicine',
      icon: '\u{1F48A}',
      cardColor: '#fff7ed',
      borderColor: '#f3dcbf',
      iconBg: '#985111',
      arrowColor: '#985111',
    },
    {
      title: 'Medicine List',
      subtitle: 'View medicines',
      icon: '\u{1F4CB}',
      cardColor: '#f3edff',
      borderColor: '#dccff6',
      iconBg: '#5b3ca4',
      arrowColor: '#5b3ca4',
    },
    {
      title: 'Medicine Stock',
      subtitle: 'Check medicine amount',
      icon: '\u{1F4E6}',
      cardColor: '#e7f8fb',
      borderColor: '#bee9ee',
      iconBg: '#117785',
      arrowColor: '#117785',
    },
    {
      title: 'Tablet Identifier',
      subtitle: 'Take photo to find name',
      icon: 'ID',
      cardColor: '#eaf7ff',
      borderColor: '#cae3f2',
      iconBg: '#2576a6',
      arrowColor: '#2576a6',
      isTextIcon: true,
    },
    {
      title: 'Safety Center',
      subtitle: 'See safety alerts',
      icon: '\u{1F6E1}\uFE0F',
      cardColor: '#fff1f4',
      borderColor: '#efccd3',
      iconBg: '#a93447',
      arrowColor: '#a93447',
    },
  ];

  const handleButtonPress = (item) => {
    if (item.label === 'Allergy') {
      onOpenAllergies();
      return;
    }

    if (item.label === 'Reminder') {
      setShowReminderMenu(true);
      setActiveReminderView('menu');
      return;
    }

    if (item.label === 'Emotions') {
      onOpenEmotionalSupport?.();
      return;
    }

    if (item.label === 'Dashboard') {
      setShowReminderMenu(false);
      setActiveReminderView('menu');
      onOpenDashboard?.();
      return;
    }

    if (item.label === 'Quick Care') {
      setShowReminderMenu(false);
      setActiveReminderView('menu');
      onOpenQuickCare?.();
      return;
    }

    console.log(`Navigating to ${item.label}`);
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
  const isCaregiver = user?.role === 'caregiver';
  const loadHomeMedicines = useCallback(async () => {
    const requestId = ++homeMedicinesRequestRef.current;
    setHomeMedicines((current) => ({ ...current, status: 'loading' }));
    try {
      const medicines = await medicationService.getMyMedications();
      if (homeMedicinesRequestRef.current === requestId) {
        setHomeMedicines({ status: 'ready', count: Array.isArray(medicines) ? medicines.length : 0 });
      }
    } catch (error) {
      if (homeMedicinesRequestRef.current === requestId) {
        setHomeMedicines({ status: 'error', count: 0 });
      }
    }
  }, []);

  useEffect(() => {
    if (isCaregiver || showReminderMenu) return undefined;
    loadHomeMedicines();
    return () => { homeMedicinesRequestRef.current += 1; };
  }, [isCaregiver, showReminderMenu, loadHomeMedicines]);

  const availableReminderMenuItems = isCaregiver
    ? reminderMenuItems.filter((item) => item.title !== 'Schedule Board' && item.title !== 'Safety Center')
    : reminderMenuItems;
  const criticalAlerts = caregiverAlerts.filter((item) => !item.is_read);
  const recentAlerts = caregiverAlerts.slice(0, 5);
  const emotionalAlerts = caregiverAlerts.filter((item) => item.source === 'emotional_support');
  const hasEmotionalConcern = emotionalAlerts.some((item) => !item.is_read) || emotionalAlerts.length > 0;
  const timelineItems = isTimelineExpanded ? caregiverTimeline : caregiverTimeline.slice(0, 4);
  const getLaunchHighlight = (type) =>
    launchIntent?.type === type
      ? { ...(launchIntent.highlight || {}), nonce: launchIntent.nonce, showScreenFrame: true }
      : null;
  const consumeLaunchIntentForView = (view = activeReminderView) => {
    if (launchIntent?.type === view) {
      onLaunchIntentConsumed?.();
    }
  };

  const leaveReminderSubView = () => {
    consumeLaunchIntentForView();
    setActiveReminderView('menu');
  };

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

    if (alertItem?.source === 'emotional_support') {
      return rawTitle || 'Emotional Support Alert';
    }

    if (
      message.includes('please arrange a refill') ||
      message.includes('requested refill') ||
      message.includes('need my')
    ) {
      return 'Refill Alert';
    }

    return rawTitle || 'Caregiver Alert';
  };

  const buildCaregiverAlertAssistantPrompt = (alertItem) => {
    const title = String(alertItem?.title || '').trim();
    const message = String(alertItem?.message || '').trim();
    const summary = message || title || 'There is a caregiver alert about my elder.';
    return `I saw this caregiver alert for my elder: "${summary}". Please explain what this means, why it may be happening, and what I should monitor or ask next.`;
  };

  const handleAlertOpenAssistant = async (alertItem) => {
    if (!alertItem?.id) {
      onOpenAssistant?.({ initialPrompt: buildCaregiverAlertAssistantPrompt(alertItem) });
      return;
    }

    try {
      await caregiverAlertService.markAlertRead(alertItem.id);
      setCaregiverAlerts((prev) => prev.map((item) => (
        item.id === alertItem.id ? { ...item, is_read: true } : item
      )));
      setCaregiverUnreadCount((prev) => Math.max(0, prev - 1));
      caregiverUnreadCountRef.current = Math.max(0, caregiverUnreadCountRef.current - 1);
    } catch (error) {
      console.log('[HomeScreen] mark alert read before assistant open failed:', error?.message || error);
    }

    onOpenAssistant?.({
      initialPrompt: buildCaregiverAlertAssistantPrompt(alertItem),
    });
  };

  const openEmotionalAssistantReview = () => {
    onOpenAssistant?.({
      initialPrompt: "Help me understand my elder's recent emotional patterns, mood changes, repeated concerns, and caregiver-safe interaction history.",
    });
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
    if (!launchIntent || !launchIntent.type) {
      return;
    }

    if (launchIntent.type === 'home') {
      setShowReminderMenu(false);
      setActiveReminderView('menu');
      onLaunchIntentConsumed?.();
      return;
    }

    if (launchIntent.type === 'medicines') {
      setShowReminderMenu(true);
      setActiveReminderView('menu');
      onLaunchIntentConsumed?.();
      return;
    }

    const viewByIntentType = {
      'routine-setup': 'routine-setup',
      'medicine-list': 'medicine-list',
      'medicine-stock': 'medicine-stock',
      'tablet-identifier': 'tablet-identifier',
      'schedule-board': 'schedule-board',
      'safety-center': 'safety-center',
    };

    const nextView = viewByIntentType[launchIntent.type];
    if (!nextView) {
      return;
    }

    if (isCaregiver && (nextView === 'schedule-board' || nextView === 'safety-center')) {
      return;
    }

    setShowReminderMenu(true);
    setActiveReminderView(nextView);
  }, [launchIntent && launchIntent.nonce, launchIntent && launchIntent.type, isCaregiver]);

  // Android hardware back button navigation for HomeScreen
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBackPress = () => {
      // If in a subview, go back to main menu
      if (showReminderMenu && activeReminderView !== 'menu') {
        consumeLaunchIntentForView(activeReminderView);
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
      setCaregiverAlertStatus('loading');
      setCaregiverTimeline([]);
      caregiverUnreadCountRef.current = 0;
      caregiverAlertsLoadedRef.current = false;
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
        setCaregiverAlertStatus('ready');
        caregiverUnreadCountRef.current = unreadCount;

        if (caregiverAlertsLoadedRef.current && unreadCount > previousUnreadCount) {
          const newestUnread = alerts.find((item) => !item.is_read);
          if (newestUnread?.message) {
            Alert.alert(getCaregiverAlertTitle(newestUnread), newestUnread.message);
          }
        }
        caregiverAlertsLoadedRef.current = true;
      } catch (error) {
        console.log('[HomeScreen] caregiver alerts load failed:', error?.message || error);
        if (mounted) {
          setCaregiverAlertStatus((current) => current === 'ready' || current === 'stale' ? 'stale' : 'error');
        }
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

  if (isCaregiver && !showReminderMenu) {
    return (
      <ScrollView style={styles.caregiverPage} contentContainerStyle={styles.caregiverContainer}>
        <Text style={caregiverStyles.eyebrow}>CAREGIVER SPACE</Text>
        <Text style={caregiverStyles.heading}>Caregiver overview</Text>
        <Text style={caregiverStyles.intro}>A clear view of the person you care for.</Text>

        <View style={caregiverStyles.alertSummary}>
          <View style={caregiverStyles.alertTop}>
            <View style={caregiverStyles.alertIcon}><Ionicons name={caregiverAlertStatus === 'error' || caregiverAlertStatus === 'stale' ? 'cloud-offline-outline' : caregiverUnreadCount ? 'notifications-outline' : 'checkmark-circle-outline'} size={25} color="#FFFFFF" /></View>
            <View style={caregiverStyles.alertCopy}>
              <Text style={caregiverStyles.alertCount}>{caregiverAlertStatus === 'loading' ? 'Checking updates' : caregiverAlertStatus === 'error' ? 'Updates unavailable' : caregiverAlertStatus === 'stale' ? 'Showing last updates' : caregiverUnreadCount ? `${caregiverUnreadCount} new ${caregiverUnreadCount === 1 ? 'update' : 'updates'}` : 'All caught up'}</Text>
              <Text style={caregiverStyles.alertDescription}>{caregiverAlertStatus === 'loading' ? 'Loading caregiver alerts' : caregiverAlertStatus === 'error' || caregiverAlertStatus === 'stale' ? 'Could not refresh alerts. Check your connection.' : caregiverUnreadCount ? 'Review what needs your attention' : 'There are no new alerts right now'}</Text>
            </View>
          </View>
          {caregiverUnreadCount > 0 ? (
            <TouchableOpacity style={caregiverStyles.markReadButton} onPress={handleCaregiverNotificationPress} accessibilityRole="button" accessibilityLabel="Mark alerts as read">
              <Text style={caregiverStyles.markRead}>Mark read</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={caregiverStyles.quickLinks}>
          <TouchableOpacity style={[caregiverStyles.quickLink, caregiverStyles.quickLinkBlue]} onPress={onOpenDashboard} accessibilityRole="button" accessibilityLabel="Open health overview">
            <View style={caregiverStyles.quickLinkIcon}><Ionicons name="grid-outline" size={24} color="#2E6770" /></View>
            <Text style={caregiverStyles.quickLinkTitle}>Health overview</Text>
            <Text style={caregiverStyles.quickLinkSubtitle}>Summary and trends</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[caregiverStyles.quickLink, caregiverStyles.quickLinkRose]} onPress={onOpenQuickCare} accessibilityRole="button" accessibilityLabel="Open risk checks">
            <View style={caregiverStyles.quickLinkIcon}><Ionicons name="pulse-outline" size={24} color="#984454" /></View>
            <Text style={caregiverStyles.quickLinkTitle}>Risk checks</Text>
            <Text style={caregiverStyles.quickLinkSubtitle}>Review health risks</Text>
          </TouchableOpacity>
        </View>

        {!!criticalAlerts.length && (
          <View style={styles.caregiverCriticalCard}>
            <Text style={styles.caregiverSectionTitle}>Immediate Action Required</Text>
            {criticalAlerts.slice(0, 2).map((alertItem) => (
              <TouchableOpacity
                key={`critical-${alertItem.id}`}
                style={styles.caregiverCriticalItem}
                onPress={() => handleAlertOpenAssistant(alertItem)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open assistant about ${getCaregiverAlertTitle(alertItem)}`}
              >
                <View style={styles.caregiverCriticalHeader}>
                  <Text style={styles.caregiverCriticalLabel}>{getCaregiverAlertTitle(alertItem)}</Text>
                  <Text style={styles.caregiverCriticalTime}>{formatAlertTime(alertItem.created_at)}</Text>
                </View>
                <Text style={styles.caregiverCriticalMessage}>{alertItem.message}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.caregiverCard}>
          <Text style={styles.caregiverSectionTitle}>Recent Updates</Text>
          {!recentAlerts.length ? (
            <Text style={styles.caregiverEmptyText}>No notifications yet.</Text>
          ) : (
            recentAlerts.map((alertItem) => (
              <TouchableOpacity
                key={`recent-${alertItem.id}`}
                style={styles.caregiverRecentItem}
                onPress={() => handleAlertOpenAssistant(alertItem)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open assistant about ${getCaregiverAlertTitle(alertItem)}`}
              >
                <View style={styles.caregiverRecentDotWrap}>
                  <Text style={styles.caregiverRecentDot}>{alertItem.is_read ? '○' : '●'}</Text>
                </View>
                <View style={styles.caregiverRecentContent}>
                  <View style={styles.caregiverRecentTopRow}>
                    <Text style={styles.caregiverRecentTitle}>{getCaregiverAlertTitle(alertItem)}</Text>
                    <Text style={styles.caregiverRecentTime}>{formatAlertTime(alertItem.created_at)}</Text>
                  </View>
                  <Text style={styles.caregiverRecentMessage}>{alertItem.message}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {hasEmotionalConcern ? (
          <TouchableOpacity
            style={[styles.caregiverAssistantCard, styles.caregiverEmotionalAssistantCard]}
            activeOpacity={0.88}
            onPress={openEmotionalAssistantReview}
            accessibilityRole="button"
            accessibilityLabel="Ask assistant about emotional support alerts"
            accessibilityHint="Opens the assistant to review recent mood patterns and caregiver-safe emotional history"
          >
            <View style={[styles.caregiverAssistantIconWrap, styles.caregiverEmotionalAssistantIconWrap]}>
              <Text style={styles.caregiverAssistantIcon}>{'\u{1F49A}'}</Text>
            </View>
            <View style={styles.caregiverAssistantTextWrap}>
              <Text style={styles.caregiverAssistantTitle}>Explore Emotional Concern</Text>
              <Text style={styles.caregiverAssistantSubtitle}>
                Ask about mood changes, repeated concerns, and recent support history.
              </Text>
            </View>
            <Text style={styles.caregiverAssistantArrow}>{'\u203A'}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.caregiverCard}>
          <View style={styles.caregiverTimelineHeader}>
            <Text style={styles.caregiverSectionTitle}>Timeline View</Text>
            <TouchableOpacity onPress={() => setIsTimelineExpanded((prev) => !prev)}>
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

        <View style={styles.caregiverCard}>
          <Text style={styles.caregiverSectionTitle}>Caregiver Tools</Text>
          <Text style={styles.caregiverToolsSubtitle}>Open the same medicine screens the elder uses, plus tablet identification.</Text>
          <View style={styles.caregiverToolsGrid}>
            {availableReminderMenuItems.map((item) => (
              <TouchableOpacity
                key={`caregiver-tool-${item.title}`}
                style={styles.caregiverToolButton}
                activeOpacity={0.88}
                onPress={() => {
                  setShowReminderMenu(true);
                  setActiveReminderView(
                    item.title === 'Tablet Identifier'
                      ? 'tablet-identifier'
                      : item.title === 'Routine Setup'
                        ? 'routine-setup'
                        : item.title === 'Add Medicine'
                          ? 'add-medicine'
                          : item.title === 'Scan Pharmacy Receipt'
                            ? 'scan-receipt'
                            : item.title === 'Medicine List'
                              ? 'medicine-list'
                              : item.title === 'Medicine Stock'
                                ? 'medicine-stock'
                                : 'menu'
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityHint={item.subtitle}
              >
                <Ionicons name={{ 'Routine Setup': 'time-outline', 'Add Medicine': 'add-circle-outline', 'Medicine List': 'list-outline', 'Medicine Stock': 'cube-outline', 'Tablet Identifier': 'scan-outline', 'Scan Pharmacy Receipt': 'receipt-outline' }[item.title] || 'medkit-outline'} size={24} color="#275C4B" />
                <Text style={styles.caregiverToolLabel}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>
    );
  }

  if (showReminderMenu) {
    if (activeReminderView === 'routine-setup') {
      return (
        <RoutineSetupScreen
          onBackToMenu={leaveReminderSubView}
          highlight={getLaunchHighlight('routine-setup')}
        />
      );
    }

    if (activeReminderView === 'add-medicine') {
      return (
        <View style={styles.addMedicinePage}>
          <View style={styles.addMedicineHeaderOuter}>
            <View style={styles.addMedicineHeader}>
            <TouchableOpacity
              style={styles.addMedicineBackButton}
              onPress={() => setActiveReminderView('menu')}
              accessibilityRole="button"
              accessibilityLabel="Back to reminder menu"
            >
              <Ionicons name="arrow-back" size={25} color="#275C4B" />
            </TouchableOpacity>
            <View style={styles.addMedicineHeaderTitleRow}>
              <Ionicons name="medkit-outline" size={23} color="#F8D978" />
              <Text style={styles.addMedicineTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Add Medicine</Text>
            </View>
              <HeaderAccountActions />
            </View>
          </View>
          <ScrollView contentContainerStyle={styles.addMedicineContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.addMedicineHintCard}>
            <View style={styles.addMedicineHintIcon}><Ionicons name="add-circle-outline" size={32} color="#275C4B" /></View>
            <View style={styles.addMedicineHintCopy}>
              <Text style={styles.addMedicineHintTitle}>Add your medicine</Text>
              <Text style={styles.addMedicineHintSubtitle}>Choose the easiest way for you.</Text>
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
              <Ionicons name="receipt-outline" size={29} color="#FFFFFF" />
            </View>
            <View style={styles.addMedicineOptionTextWrap}>
              <Text style={styles.addMedicineOptionTitle}>Scan Pharmacy Receipt</Text>
              <Text style={styles.addMedicineOptionSubtitle}>Capture your pharmacy receipt details</Text>
            </View>
            <View style={[styles.addMedicineOptionArrow, styles.addMedicineOptionArrowPrimary]}><Ionicons name="chevron-forward" size={21} color="#287CB4" /></View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.addMedicineOptionCard, styles.addMedicineOptionCardManual]}
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
              <Ionicons name="create-outline" size={29} color="#FFFFFF" />
            </View>
            <View style={styles.addMedicineOptionTextWrap}>
              <Text style={styles.addMedicineOptionTitle}>Manual Entry</Text>
              <Text style={styles.addMedicineOptionSubtitle}>Type in the details yourself</Text>
            </View>
            <View style={[styles.addMedicineOptionArrow, styles.addMedicineOptionArrowManual]}><Ionicons name="chevron-forward" size={21} color="#218265" /></View>
          </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }

    if (activeReminderView === 'manual-entry') {
      const currentDraft = medicineDraftQueue.length
        ? medicineDraftQueue[Math.min(medicineDraftIndex, medicineDraftQueue.length - 1)]
        : medicineDraft;

      return (
        <ManualEntryScreen
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
      return (
        <MedicineListScreen
          onBack={leaveReminderSubView}
          highlight={getLaunchHighlight('medicine-list')}
        />
      );
    }

    if (activeReminderView === 'medicine-stock') {
      return (
        <MedicineStockScreen
          onBack={leaveReminderSubView}
          highlight={getLaunchHighlight('medicine-stock')}
        />
      );
    }

    if (activeReminderView === 'tablet-identifier') {
      return <TabletIdentifierScreen onBack={leaveReminderSubView} />;
    }

    if (activeReminderView === 'schedule-board') {
      return <ScheduleBoardScreen user={user} onBack={leaveReminderSubView} />;
    }

    if (activeReminderView === 'safety-center') {
      return <SafetyCenterScreen onBack={leaveReminderSubView} />;
    }

    const medicineIcons = {
      'Schedule Board': 'calendar-outline',
      'Routine Setup': 'time-outline',
      'Add Medicine': 'add-circle-outline',
      'Medicine List': 'list-outline',
      'Medicine Stock': 'cube-outline',
      'Tablet Identifier': 'scan-outline',
      'Safety Center': 'shield-checkmark-outline',
    };
    const medicineMenuColors = {
      'Schedule Board': { background: '#EDF7F0', border: '#D3E9DA', accent: '#168565', iconBackground: '#DFF1E5' },
      'Routine Setup': { background: '#FFF8EA', border: '#F1DFC1', accent: '#A56325', iconBackground: '#FCEBD2' },
      'Add Medicine': { background: '#EAF5FD', border: '#CBE4F5', accent: '#287CB4', iconBackground: '#D9EDFB' },
      'Medicine List': { background: '#F3F0FC', border: '#E1D9F5', accent: '#6D56A9', iconBackground: '#E8E1F8' },
      'Medicine Stock': { background: '#EAF7F7', border: '#CBE6E5', accent: '#168282', iconBackground: '#D8F0EF' },
      'Tablet Identifier': { background: '#EAF5FD', border: '#CBE4F5', accent: '#287CB4', iconBackground: '#D9EDFB' },
      'Safety Center': { background: '#FFF1EE', border: '#F1D7D0', accent: '#B75D54', iconBackground: '#FBE2DC' },
    };
    return (
      <View style={medicineStyles.page}>
        <View style={medicineStyles.headerBar}>
          <TouchableOpacity style={medicineStyles.navIconButton} onPress={() => { setShowReminderMenu(false); setActiveReminderView('menu'); }} accessibilityRole="button" accessibilityLabel="Back to home">
            <Ionicons name="arrow-back" size={25} color="#275C4B" />
          </TouchableOpacity>
          <View style={medicineStyles.headerTitleRow}>
            <Ionicons name="medkit-outline" size={22} color="#F8D978" />
            <Text style={medicineStyles.topBarTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Medicines</Text>
          </View>
          <HeaderAccountActions />
        </View>
        <ScrollView contentContainerStyle={homeStyles.content} showsVerticalScrollIndicator={false}>
        <View style={medicineStyles.intro}>
          <View pointerEvents="none" style={medicineStyles.introHalo} />
          <Image source={require('../../assets/home-medicine-illustration.png')} resizeMode="contain" style={[medicineStyles.introArt, screenWidth < 360 && medicineStyles.introArtNarrow]} accessible={false} />
          <Text style={medicineStyles.eyebrow}>DAILY MEDICATION CARE</Text>
          <Text style={medicineStyles.title}>Medicines</Text>
          <Text style={medicineStyles.description}>Your medicines and daily schedule in one place.</Text>
        </View>
        <View style={medicineStyles.sectionRow}>
          <Text style={medicineStyles.sectionTitle}>Manage medicines</Text>
          <View style={medicineStyles.textSizeControl}>
            <TouchableOpacity onPress={() => setLargeTextMode(false)} accessibilityRole="button" accessibilityLabel="Normal text size" style={[medicineStyles.textSizeButton, !largeTextMode && medicineStyles.textSizeActive]}>
              <Text style={[medicineStyles.textSizeText, !largeTextMode && medicineStyles.textSizeTextActive]}>A</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setLargeTextMode(true)} accessibilityRole="button" accessibilityLabel="Large text size" style={[medicineStyles.textSizeButton, largeTextMode && medicineStyles.textSizeActive]}>
              <Text style={[medicineStyles.textSizeText, largeTextMode && medicineStyles.textSizeTextActive]}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>
        {availableReminderMenuItems.map((item) => {
          const colors = medicineMenuColors[item.title] || medicineMenuColors['Schedule Board'];
          return (
            <TouchableOpacity key={item.title} style={[medicineStyles.row, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={() => handleReminderMenuPress(item.title)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.subtitle}>
              <View style={[medicineStyles.rowIcon, { backgroundColor: colors.iconBackground }]}><Ionicons name={medicineIcons[item.title] || 'medkit-outline'} size={26} color={colors.accent} /></View>
              <View style={medicineStyles.rowCopy}>
                <Text style={[medicineStyles.rowTitle, { fontSize: 18 * textScale }]}>{item.title}</Text>
                <Text style={[medicineStyles.rowSubtitle, { fontSize: 16 * textScale }]}>{item.subtitle}</Text>
              </View>
              <View style={[medicineStyles.rowArrow, { backgroundColor: colors.iconBackground }]}><Ionicons name="chevron-forward" size={21} color={colors.accent} /></View>
            </TouchableOpacity>
          );
        })}
        </ScrollView>
      </View>
    );
  }

  const now = new Date();
  const todayLabel = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = String(user?.fullName || '').trim().split(/\s+/)[0] || 'there';
  const careActions = [
    { key: 'medication', title: 'Medication', detail: 'Manage your medicines', icon: 'medkit-outline', color: '#168966', tint: '#E6F5EE', border: '#CBE9DB', onPress: () => { setShowReminderMenu(true); setActiveReminderView('menu'); } },
    { key: 'medicine-safety', title: 'Safety', detail: 'Allergies & reactions', icon: 'shield-checkmark-outline', color: '#C46057', tint: '#FFF0EC', border: '#F4D9D2', onPress: onOpenAllergies },
    { key: 'emotions', title: 'Emotions', detail: 'How you feel today', icon: 'happy-outline', color: '#3486BD', tint: '#E8F4FD', border: '#D2EAF9', onPress: () => onOpenEmotionalSupport?.('SupportMoodCheckInScreen') },
    { key: 'cognitive', title: 'Cognitive care', detail: 'Games & activities', icon: 'extension-puzzle-outline', color: '#7757B7', tint: '#F2EDFC', border: '#E2D8F6', onPress: () => onOpenEmotionalSupport?.('CognitiveActivityLibraryScreen') },
    { key: 'dashboard', title: 'Care overview', detail: 'Health summary', icon: 'clipboard-outline', color: '#B88624', tint: '#FFF6DF', border: '#F3E6BF', onPress: onOpenDashboard },
    { key: 'wellness', title: 'Wellness', detail: 'Daily support', icon: 'leaf-outline', color: '#C56E72', tint: '#FFF0F0', border: '#F5DDDE', onPress: () => onOpenEmotionalSupport?.('ElderHome') },
  ];
  const homeHero = homeMedicines.status === 'error'
    ? { status: 'Unavailable', title: 'Medicines unavailable', detail: 'Check your connection and try again.', action: 'Try again', icon: 'refresh-outline' }
    : homeMedicines.status === 'loading'
      ? { status: 'Loading', title: 'Your medicine plan', detail: 'Checking your saved medicines.', action: 'Open Medicines', icon: 'medkit-outline' }
      : homeMedicines.count === 0
        ? { status: 'Getting started', title: 'Start your medicine plan', detail: 'Add your first medicine to keep your care organized.', action: 'Add a medicine', icon: 'add-circle-outline' }
        : { status: `${homeMedicines.count} ${homeMedicines.count === 1 ? 'medicine' : 'medicines'} saved`, title: 'Your medicines', detail: 'Review your daily schedule and medicine details.', action: "View today's schedule", icon: 'calendar-outline' };
  const openHomeHero = () => {
    if (homeMedicines.status === 'error') {
      loadHomeMedicines();
      return;
    }
    setShowReminderMenu(true);
    setActiveReminderView(homeMedicines.status === 'loading' ? 'menu' : homeMedicines.status === 'ready' && homeMedicines.count === 0 ? 'add-medicine' : 'schedule-board');
  };
  const refreshHome = async () => {
    setIsRefreshingHome(true);
    try {
      await loadHomeMedicines();
    } finally {
      setIsRefreshingHome(false);
    }
  };

  return (
    <ScrollView style={homeStyles.page} contentContainerStyle={homeStyles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={isRefreshingHome} onRefresh={refreshHome} colors={['#168966']} tintColor="#168966" />}>

      <View style={homeStyles.greeting}>
        <View pointerEvents="none" style={homeStyles.greetingHalo} />
        <View pointerEvents="none" style={homeStyles.greetingLeaf} />
        <Image source={require('../../assets/home-elder-illustration.png')} resizeMode="contain" style={homeStyles.greetingIllustration} accessible={false} />
        <View style={homeStyles.dateRow}>
          <Ionicons name="calendar-outline" size={19} color="#2576A6" />
          <Text style={homeStyles.date}>{todayLabel}</Text>
        </View>
        <Text style={[homeStyles.greetingTitle, screenWidth < 360 && homeStyles.greetingTitleNarrow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{greeting},</Text>
        <Text style={homeStyles.greetingName}>{firstName}</Text>
        <Text style={homeStyles.subtitle}>We're here to support your health and wellbeing.</Text>
      </View>

      {isLocalMode ? (
        <View style={homeStyles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={20} color="#795522" />
          <Text style={homeStyles.offlineText}>Changes are saved on this device while the shared database is unavailable.</Text>
        </View>
      ) : null}

      <TouchableOpacity style={homeStyles.featuredCard} onPress={openHomeHero} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={homeHero.action} accessibilityHint={homeHero.detail}>
        <View pointerEvents="none" style={homeStyles.featuredGreenPanel} />
        <View style={homeStyles.featuredIcon}>
          <Ionicons name="medkit-outline" size={29} color="#FFFFFF" />
        </View>
        <View style={homeStyles.featuredCopy}>
          <Text style={homeStyles.featuredTitle}>{homeHero.title}</Text>
          <Text style={homeStyles.featuredDescription}>{homeMedicines.status === 'ready' && homeMedicines.count > 0 ? homeHero.status : homeHero.detail}</Text>
          <Text style={homeStyles.featuredAction}>{homeHero.action}</Text>
        </View>
        <View style={homeStyles.featuredArrow}><Ionicons name="chevron-forward" size={23} color="#218265" /></View>
      </TouchableOpacity>

      <View style={homeStyles.sectionHeading}>
        <Text style={homeStyles.sectionTitle}>Explore your care</Text>
        <Text style={homeStyles.sectionSubtitle}>Choose what you need today</Text>
      </View>
      <View style={homeStyles.actionGrid}>
        {careActions.map((item) => (
          <TouchableOpacity key={item.key} style={[homeStyles.actionCard, { backgroundColor: item.tint, borderColor: item.border }]} onPress={item.onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={item.title} accessibilityHint={item.detail}>
            <View style={homeStyles.actionTopRow}>
              <View style={[homeStyles.actionIcon, { borderColor: item.border }]}>
                <Ionicons name={item.icon} size={27} color={item.color} />
              </View>
              <View style={[homeStyles.actionArrow, { backgroundColor: item.border }]}><Ionicons name="chevron-forward" size={19} color={item.color} /></View>
            </View>
            <View style={homeStyles.actionCopy}>
              <Text style={homeStyles.actionTitle}>{item.title}</Text>
              <Text style={homeStyles.actionDetail}>{item.detail}</Text>
            </View>
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
    backgroundColor: '#F7F8F5',
  },
  homeContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? 28 : 22,
    paddingBottom: 128,
  },
  homeTopBar: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  homeLogoPill: {
    width: '44%',
    minWidth: 132,
    maxWidth: 172,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E7E0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8d7355',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  homeBrandLogo: {
    width: 82,
    height: 34,
    flexShrink: 1,
  },
  homeTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  homeTopProfileButton: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#ace1ce',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    shadowColor: '#6f604b',
    shadowOpacity: 0.14,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#f2d47a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#6f604b',
    shadowOpacity: 0.14,
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
    borderColor: '#275C4B',
    borderRightWidth: 0,
  },
  homeTopLogoutArrow: {
    position: 'absolute',
    right: 0,
    color: '#275C4B',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  homeTopLogoutText: {
    color: '#275C4B',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  homeHeroCard: {
    minHeight: 154,
    borderRadius: 24,
    backgroundColor: '#275C4B',
    borderWidth: 2,
    borderColor: '#e5c44f',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#725e25',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  homeHeroTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  homeDateText: {
    color: '#fff4b8',
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
    color: '#ecfff6',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  homeHeroBadge: {
    width: 78,
    minHeight: 92,
    borderRadius: 24,
    backgroundColor: '#fff4b8',
    borderWidth: 2,
    borderColor: '#fff9d8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeHeroBadgeIcon: {
    color: '#275C4B',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  homeHeroBadgeText: {
    color: '#275C4B',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 4,
  },
  homePrimaryAction: {
    minHeight: 118,
    borderRadius: 20,
    backgroundColor: '#e3f8ee',
    borderWidth: 1,
    borderColor: '#b8ead6',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#7a674f',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  homePrimaryIconWrap: {
    width: 66,
    height: 66,
    borderRadius: 20,
    backgroundColor: '#168464',
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
    minWidth: 0,
    paddingRight: 8,
  },
  homePrimaryEyebrow: {
    color: '#275C4B',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  homePrimaryTitle: {
    color: '#193D31',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  homePrimarySubtitle: {
    color: '#3d3833',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 5,
  },
  homePrimaryArrowWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fffefa',
    borderWidth: 1,
    borderColor: '#b8ead6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homePrimaryArrow: {
    color: '#168464',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
  },
  homeSectionHeader: {
    marginBottom: 12,
  },
  homeSectionTitle: {
    color: '#193D31',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  homeSectionSubtitle: {
    color: '#53645A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    marginTop: 2,
  },
  homeActionList: {
    marginBottom: 4,
  },
  homeActionCard: {
    minHeight: 106,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#7a674f',
    shadowOpacity: 0.1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
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
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 32,
  },
  homeActionTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  homeActionTitle: {
    color: '#193D31',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  homeActionSubtitle: {
    color: '#3d3833',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  homeActionHelper: {
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
  },
  homeActionArrowWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fffefa',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  localModeBanner: {
    backgroundColor: '#fff6da',
    borderColor: '#efd28a',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  localModeTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#7b5700',
  },
  localModeText: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    color: '#6d5a24',
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
    color: '#275C4B',
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
    backgroundColor: '#275C4B',
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
    backgroundColor: '#F7F8F5',
    paddingTop: Platform.OS === 'android' ? 28 : 22,
    paddingBottom: 118,
    paddingHorizontal: 22,
  },
  caregiverPage: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },
  caregiverContainer: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 110,
    backgroundColor: '#F7F8F5',
  },
  caregiverHeaderCard: {
    minHeight: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#193D31',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  caregiverHeaderTextWrap: {
    flex: 1,
    paddingRight: 14,
  },
  caregiverEyebrow: {
    color: '#0F766E',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 4,
  },
  caregiverTitle: {
    color: '#102A3A',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  caregiverWelcome: {
    marginTop: 6,
    color: '#587083',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  caregiverNotificationButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF7D6',
    borderWidth: 1,
    borderColor: '#F5D56B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B7791F',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  caregiverNotificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dd4d4d',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  caregiverNotificationBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  caregiverNotificationIcon: {
    fontSize: 26,
  },
  caregiverCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    shadowColor: '#1C3E31',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  caregiverToolsSubtitle: {
    marginTop: -4,
    marginBottom: 12,
    fontSize: 14,
    color: '#63736A',
    fontWeight: '600',
    lineHeight: 20,
  },
  caregiverToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  caregiverAssistantCard: {
    minHeight: 88,
    backgroundColor: '#F7F8F5',
    borderWidth: 1,
    borderColor: '#bfd8ef',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  caregiverEmotionalAssistantCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  caregiverAssistantIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#275C4B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  caregiverEmotionalAssistantIconWrap: {
    backgroundColor: '#15803D',
  },
  caregiverAssistantIcon: {
    fontSize: 20,
  },
  caregiverAssistantTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  caregiverAssistantTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#193D31',
    lineHeight: 22,
  },
  caregiverAssistantSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#5e7183',
    lineHeight: 17,
  },
  caregiverAssistantArrow: {
    fontSize: 28,
    lineHeight: 32,
    color: '#275C4B',
    fontWeight: '900',
  },
  caregiverToolButton: {
    width: '48%',
    minHeight: 92,
    backgroundColor: '#F7F8F5',
    borderWidth: 1,
    borderColor: '#E1E7E0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caregiverToolIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  caregiverToolLabel: {
    textAlign: 'center',
    color: '#193D31',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 9,
  },
  caregiverCardTitle: {
    color: '#53645A',
    fontSize: 13,
    marginBottom: 6,
  },
  caregiverCardValue: {
    fontSize: 20,
    color: '#193D31',
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
    borderWidth: 1,
    borderColor: '#DCEBED',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  caregiverInfoTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: '#223848',
    fontWeight: '900',
  },
  caregiverInfoBadge: {
    backgroundColor: '#E6F3FF',
    color: '#1769A6',
    fontSize: 13,
    fontWeight: '900',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  caregiverDashboardCard: {
    minHeight: 108,
    backgroundColor: '#E8F8FA',
    borderWidth: 1,
    borderColor: '#92DCE9',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0F7490',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  caregiverDashboardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#0F7490',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  caregiverDashboardIcon: {
    fontSize: 26,
  },
  caregiverDashboardTextWrap: {
    flex: 1,
    paddingRight: 10,
  },
  caregiverDashboardTitle: {
    fontSize: 20,
    lineHeight: 26,
    color: '#10384A',
    fontWeight: '900',
  },
  caregiverDashboardSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: '#486B79',
    fontWeight: '700',
  },
  caregiverDashboardArrow: {
    fontSize: 32,
    lineHeight: 36,
    color: '#0F7490',
    fontWeight: '900',
  },
  caregiverQuickCareCard: {
    backgroundColor: '#FFF1F4',
    borderColor: '#F1C7D1',
  },
  caregiverQuickCareIconWrap: {
    backgroundColor: '#A93447',
  },
  caregiverQuickCareArrow: {
    color: '#A93447',
  },
  caregiverSectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: '#193D31',
    fontWeight: '800',
    marginBottom: 12,
  },
  caregiverCriticalCard: {
    backgroundColor: '#fff4f5',
    borderColor: '#f5ccd1',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  caregiverCriticalItem: {
    borderLeftColor: '#d64054',
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 10,
  },
  caregiverCriticalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  caregiverCriticalLabel: {
    color: '#b0293f',
    fontSize: 14,
    fontWeight: '700',
  },
  caregiverCriticalTime: {
    color: '#8e5a63',
    fontSize: 12,
  },
  caregiverCriticalMessage: {
    color: '#4a2d33',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 2,
  },
  caregiverRecentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3F5',
  },
  caregiverRecentDotWrap: {
    width: 28,
    alignItems: 'center',
    paddingTop: 4,
  },
  caregiverRecentDot: {
    color: '#0F7490',
    fontSize: 14,
  },
  caregiverRecentContent: {
    flex: 1,
    marginLeft: 4,
  },
  caregiverRecentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  caregiverRecentTitle: {
    color: '#203646',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    flexShrink: 1,
    marginRight: 8,
  },
  caregiverRecentTime: {
    color: '#6A8290',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  caregiverRecentMessage: {
    color: '#4A6070',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  caregiverEmptyText: {
    color: '#687f90',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caregiverTimelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caregiverTimelineDayLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: '#607684',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  caregiverTimelineLink: {
    color: '#0F7490',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
  },
  caregiverTimelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 10,
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
    backgroundColor: '#d7dde3',
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
    color: '#4a5c69',
    fontSize: 12,
    fontWeight: '700',
  },
  caregiverTimelineText: {
    color: '#324B5A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    marginTop: 2,
  },
  caregiverTimelineExpandButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F7F8F5',
  },
  caregiverTimelineExpandButtonText: {
    color: '#2b72b8',
    fontSize: 12,
    fontWeight: '700',
  },
  reminderScroll: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },
  reminderTopBar: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  reminderLogoPill: {
    width: '44%',
    minWidth: 132,
    maxWidth: 172,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E7E0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8d7355',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  reminderLogo: {
    width: 82,
    height: 34,
  },
  reminderTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  reminderTopIconButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    shadowColor: '#6f604b',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  reminderProfileButton: {
    borderColor: '#ace1ce',
  },
  reminderHomeButton: {
    borderColor: '#f2d47a',
  },
  reminderTopIcon: {
    fontSize: 27,
    lineHeight: 31,
  },
  reminderMenuHeading: {
    color: '#193D31',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    marginBottom: 20,
  },
  reminderHeroBanner: {
    minHeight: 156,
    borderRadius: 24,
    backgroundColor: '#275C4B',
    borderWidth: 2,
    borderColor: '#e5c44f',
    paddingHorizontal: 22,
    paddingVertical: 18,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#725e25',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  reminderHeroIconTile: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: '#fee48a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 22,
    borderWidth: 1,
    borderColor: '#fff5be',
  },
  reminderHeroIcon: {
    fontSize: 46,
    lineHeight: 50,
  },
  reminderTitle: {
    flex: 1,
    color: '#ffffff',
    fontWeight: '900',
    letterSpacing: 0,
  },
  reminderActionHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  reminderInfoText: {
    flexShrink: 1,
    color: '#28231f',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
  },
  textModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 10,
  },
  textModeLabel: {
    marginRight: 8,
    color: '#493f35',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  textModeButton: {
    minWidth: 50,
    height: 50,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
    borderWidth: 1,
    borderColor: '#e3d6c3',
  },
  textModeButtonActive: {
    backgroundColor: '#275C4B',
    borderColor: '#275C4B',
  },
  textModeButtonText: {
    color: '#42372e',
    fontWeight: '900',
    fontSize: 17,
    lineHeight: 22,
  },
  textModeButtonTextActive: {
    color: '#ffffff',
  },
  reminderButtonList: {
    width: '100%',
  },
  reminderButton: {
    minHeight: 108,
    borderRadius: 20,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#7a674f',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  reminderButtonIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 18,
  },
  reminderButtonIcon: {
    color: '#ffffff',
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
  },
  reminderButtonTextIcon: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: 0,
  },
  reminderButtonTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  reminderButtonText: {
    color: '#193D31',
    fontWeight: '900',
    letterSpacing: 0,
  },
  reminderButtonSubText: {
    marginTop: 5,
    color: '#3d3833',
    fontWeight: '800',
  },
  reminderButtonArrowWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fffefa',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reminderButtonArrow: {
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '900',
  },
  addMedicinePage: { flex: 1, backgroundColor: '#F7F8F5' },
  addMedicineHeaderOuter: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 22, paddingHorizontal: 18 },
  addMedicineContainer: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 16, paddingHorizontal: 18, paddingBottom: 110 },
  addMedicineHeader: { minHeight: 72, borderRadius: 22, backgroundColor: '#275C4B', borderWidth: 2, borderColor: '#F4CF75', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#20382F', shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  addMedicineBackButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFF4C6', alignItems: 'center', justifyContent: 'center' },
  addMedicineHeaderTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  addMedicineTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '900', marginLeft: 7, flexShrink: 1 },
  addMedicineHeaderSpacer: { width: 50 },
  addMedicineHintCard: { minHeight: 138, flexDirection: 'row', alignItems: 'center', backgroundColor: '#275C4B', borderRadius: 22, borderWidth: 2, borderColor: '#F4CF75', padding: 17, marginBottom: 17, shadowColor: '#315A4F', shadowOpacity: 0.14, shadowRadius: 11, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addMedicineHintIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: '#F8D978', borderWidth: 2, borderColor: '#FFF4C6', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  addMedicineHintCopy: { flex: 1, minWidth: 0 },
  addMedicineHintTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontWeight: '900' },
  addMedicineHintSubtitle: { color: '#E9F7F1', fontSize: 16, lineHeight: 22, fontWeight: '600', marginTop: 6 },
  addMedicineOptionCard: { minHeight: 112, borderRadius: 20, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 15, marginBottom: 13, flexDirection: 'row', alignItems: 'center', shadowColor: '#6B5D4B', shadowOpacity: 0.07, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  addMedicineOptionCardPrimary: { borderColor: '#C9E2F1', backgroundColor: '#EAF5FD' },
  addMedicineOptionCardManual: { borderColor: '#CAE4D6', backgroundColor: '#EAF7F0' },
  addMedicineOptionIconWrap: { width: 60, height: 60, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  addMedicineOptionIconWrapPrimary: { backgroundColor: '#287CB4' },
  addMedicineOptionIconWrapManual: { backgroundColor: '#218265' },
  addMedicineOptionTextWrap: { flex: 1, minWidth: 0, paddingRight: 7 },
  addMedicineOptionTitle: { color: '#193D31', fontSize: 19, lineHeight: 25, fontWeight: '900' },
  addMedicineOptionSubtitle: { color: '#53645A', fontSize: 15, lineHeight: 21, marginTop: 3 },
  addMedicineOptionArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  addMedicineOptionArrowPrimary: { backgroundColor: '#D9ECF8' },
  addMedicineOptionArrowManual: { backgroundColor: '#D9F0E4' },
});

const homeStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F4FAF6' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 110 },
  greeting: { minHeight: 282, marginHorizontal: -20, marginTop: 0, paddingTop: 34, paddingHorizontal: 24, paddingBottom: 28, backgroundColor: '#ECF8F1', overflow: 'hidden' },
  greetingHalo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#D5F0E3', right: -80, top: -72, opacity: 0.9 },
  greetingLeaf: { position: 'absolute', width: 105, height: 180, borderTopLeftRadius: 105, borderBottomRightRadius: 105, backgroundColor: '#BDE8D1', opacity: 0.6, right: -23, bottom: -53, transform: [{ rotate: '-25deg' }] },
  greetingIllustration: { position: 'absolute', width: 295, height: 246, right: -54, bottom: -9 },
  dateRow: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  date: { color: '#37665B', fontSize: 15, lineHeight: 21, fontWeight: '800', marginLeft: 9 },
  greetingTitle: { color: '#174C3D', fontSize: 31, lineHeight: 39, fontWeight: '900', marginTop: 24, maxWidth: '75%', zIndex: 1 },
  greetingTitleNarrow: { fontSize: 27, lineHeight: 35 },
  greetingName: { color: '#18845F', fontSize: 34, lineHeight: 41, fontWeight: '900', maxWidth: '62%', zIndex: 1 },
  subtitle: { color: '#546F69', fontSize: 16, lineHeight: 23, fontWeight: '500', marginTop: 13, maxWidth: '57%', zIndex: 1 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF5E6', borderColor: '#EAD9B9', borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 16 },
  offlineText: { flex: 1, marginLeft: 10, color: '#795522', fontSize: 16, lineHeight: 23 },
  featuredCard: { minHeight: 126, flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF5FD', borderRadius: 21, padding: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#B6DCCF', marginTop: -7, shadowColor: '#315A4F', shadowOpacity: 0.1, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3, zIndex: 1 },
  featuredGreenPanel: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '42%', backgroundColor: '#E0F1E7' },
  featuredIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#287CB4', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  featuredCopy: { flex: 1, minWidth: 0 },
  featuredTitle: { color: '#174C3D', fontSize: 21, lineHeight: 27, fontWeight: '900' },
  featuredDescription: { color: '#536B61', fontSize: 15, lineHeight: 21, marginTop: 3 },
  featuredAction: { color: '#2576A6', fontSize: 15, lineHeight: 21, fontWeight: '800', marginTop: 7 },
  featuredArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#CDE9DA', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sectionHeading: { marginTop: 29, marginBottom: 16, paddingHorizontal: 3 },
  sectionTitle: { color: '#174C3D', fontSize: 24, lineHeight: 31, fontWeight: '900' },
  sectionSubtitle: { color: '#607671', fontSize: 16, lineHeight: 23, marginTop: 3 },
  actionGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: { width: '48.5%', minHeight: 145, borderWidth: 1, borderRadius: 21, padding: 12, marginBottom: 11, justifyContent: 'space-between' },
  actionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionIcon: { width: 46, height: 46, borderWidth: 1, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  actionCopy: { marginTop: 10 },
  actionTitle: { color: '#173D37', fontSize: 17, lineHeight: 21, fontWeight: '900' },
  actionDetail: { color: '#5B706D', fontSize: 14, lineHeight: 18, marginTop: 3 },
  actionArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

const caregiverStyles = StyleSheet.create({
  eyebrow: { color: '#62736B', fontSize: 12, lineHeight: 18, fontWeight: '900', letterSpacing: 1 },
  heading: { color: '#193D31', fontSize: 29, lineHeight: 36, fontWeight: '800', marginTop: 5 },
  intro: { color: '#53645A', fontSize: 16, lineHeight: 23, marginTop: 5, marginBottom: 21 },
  alertSummary: { backgroundColor: '#1C5849', borderColor: '#2C745D', borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 15, minHeight: 108, shadowColor: '#153E31', shadowOpacity: 0.13, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  alertTop: { flexDirection: 'row', alignItems: 'center' },
  alertIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#397A65', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  alertCopy: { flex: 1 },
  alertCount: { color: '#FFFFFF', fontSize: 19, fontWeight: '800' },
  alertDescription: { color: '#E3F1E8', fontSize: 15, lineHeight: 21, marginTop: 4 },
  markReadButton: { minHeight: 48, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 17, marginTop: 14 },
  markRead: { color: '#275C4B', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  quickLinks: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  quickLink: { width: '48%', minHeight: 150, borderWidth: 1, borderRadius: 19, padding: 15 },
  quickLinkBlue: { backgroundColor: '#EFF7F8', borderColor: '#D6E9EC' },
  quickLinkRose: { backgroundColor: '#FDF2F4', borderColor: '#EFDCE0' },
  quickLinkIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  quickLinkTitle: { color: '#193D31', fontSize: 18, lineHeight: 23, fontWeight: '800', marginTop: 11 },
  quickLinkSubtitle: { color: '#53645A', fontSize: 15, lineHeight: 21, marginTop: 2 },
});

const medicineStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F0F5EF' },
  headerBar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#275C4B', borderColor: '#F4CF75', borderWidth: 2, borderRadius: 22, paddingHorizontal: 10, marginHorizontal: 20, marginTop: 14, marginBottom: 0, shadowColor: '#20382F', shadowOpacity: 0.17, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  navIconButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFF4C6', alignItems: 'center', justifyContent: 'center' },
  headerTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  headerSpacer: { width: 50 },
  topBarTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 28, fontWeight: '900', marginLeft: 7, flexShrink: 1 },
  intro: { minHeight: 190, marginTop: 17, marginBottom: 25, borderRadius: 24, borderWidth: 1, borderColor: '#D5E8DA', backgroundColor: '#E8F3EB', paddingHorizontal: 19, paddingVertical: 25, justifyContent: 'center', overflow: 'hidden' },
  introHalo: { position: 'absolute', width: 175, height: 175, borderRadius: 88, right: -43, top: -40, backgroundColor: '#DBECF4', opacity: 0.8 },
  introArt: { position: 'absolute', width: 156, height: 156, right: -20, bottom: -5 },
  introArtNarrow: { width: 132, height: 132, right: -18 },
  eyebrow: { color: '#357966', fontSize: 12, lineHeight: 17, fontWeight: '900', letterSpacing: 0.8, maxWidth: '60%', zIndex: 1 },
  title: { color: '#174C3D', fontSize: 31, lineHeight: 39, fontWeight: '900', marginTop: 7, maxWidth: '65%', zIndex: 1 },
  description: { color: '#45675C', fontSize: 15, lineHeight: 22, fontWeight: '500', marginTop: 6, maxWidth: '60%', zIndex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 2 },
  sectionTitle: { color: '#193D31', fontSize: 22, fontWeight: '800', flexShrink: 1, marginRight: 8 },
  textSizeControl: { flexDirection: 'row', backgroundColor: '#E3F1E9', borderRadius: 12, padding: 3 },
  textSizeButton: { minWidth: 44, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  textSizeActive: { backgroundColor: '#FFFFFF' },
  textSizeText: { color: '#53645A', fontSize: 16, fontWeight: '800' },
  textSizeTextActive: { color: '#275C4B' },
  row: { minHeight: 91, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 13, marginBottom: 11 },
  rowIcon: { width: 55, height: 55, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  rowCopy: { flex: 1, paddingRight: 8 },
  rowTitle: { color: '#193D31', fontWeight: '800', lineHeight: 26 },
  rowSubtitle: { color: '#53645A', lineHeight: 23, marginTop: 2 },
  rowArrow: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});

export default HomeScreen;
