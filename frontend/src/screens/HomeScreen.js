import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';

const elderMedsLogo = require('../../assets/logo.png');
import RoutineSetupScreen from './RoutineSetupScreen';
import ManualEntryScreen from './ManualEntryScreen';
import MedicineListScreen from './MedicineListScreen';
import MedicineStockScreen from './MedicineStockScreen';
import TabletIdentifierScreen from './TabletIdentifierScreen';
import ScheduleBoardScreen from './ScheduleBoardScreen';
import SafetyCenterScreen from './SafetyCenterScreen';
import ReceiptScanScreen from './ReceiptScanScreen';
import { caregiverAlertService } from '../services/caregiverAlertService';

const HomeScreen = ({ user, isLocalMode, onOpenProfile, onOpenAllergies, onOpenMedicine, onOpenHistory, onOpenEmotionalSupport, onOpenDashboard, onOpenQuickCare, onOpenAssistant, onLogout, launchIntent, onLaunchIntentConsumed }) => {
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

  if (isCaregiver && !showReminderMenu) {
    return (
      <ScrollView style={styles.caregiverPage} contentContainerStyle={styles.caregiverContainer}>
        <View style={styles.caregiverHeaderCard}>
          <View style={styles.caregiverHeaderTextWrap}>
            <Text style={styles.caregiverEyebrow}>Caregiver Home</Text>
            <Text
              style={styles.caregiverTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.86}
            >
              Caregiver Alerts
            </Text>
            <Text style={styles.caregiverWelcome}>
              Monitoring updates for {user?.fullName || 'your patient'}
            </Text>
          </View>
          <TouchableOpacity style={styles.caregiverNotificationButton} onPress={handleCaregiverNotificationPress}>
            <Text style={styles.caregiverNotificationIcon}>🔔</Text>
            {caregiverUnreadCount > 0 && (
              <View style={styles.caregiverNotificationBadge}>
                <Text style={styles.caregiverNotificationBadgeText}>{caregiverUnreadCount > 99 ? '99+' : caregiverUnreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.caregiverInfoStrip}>
          <Text style={styles.caregiverInfoTitle}>Today's Alerts</Text>
          <Text style={styles.caregiverInfoBadge}>{caregiverUnreadCount} Active</Text>
        </View>

        <TouchableOpacity
          style={styles.caregiverDashboardCard}
          activeOpacity={0.88}
          onPress={onOpenDashboard}
          accessibilityRole="button"
          accessibilityLabel="Open conversational dashboard"
          accessibilityHint="Shows the elder's unified medication, mood, alert, stock, and routine summary"
        >
          <View style={styles.caregiverDashboardIconWrap}>
            <Text style={styles.caregiverDashboardIcon}>{'\u{1F4CA}'}</Text>
          </View>
          <View style={styles.caregiverDashboardTextWrap}>
            <Text style={styles.caregiverDashboardTitle}>Conversational Dashboard</Text>
            <Text style={styles.caregiverDashboardSubtitle}>
              Review the elder's health summary, risks, alerts, stock, mood, and routines.
            </Text>
          </View>
          <Text style={styles.caregiverDashboardArrow}>{'\u203A'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.caregiverDashboardCard, styles.caregiverQuickCareCard]}
          activeOpacity={0.88}
          onPress={onOpenQuickCare}
          accessibilityRole="button"
          accessibilityLabel="Open Quick Care"
          accessibilityHint="Shows risk prediction summary and checks"
        >
          <View style={[styles.caregiverDashboardIconWrap, styles.caregiverQuickCareIconWrap]}>
            <Text style={styles.caregiverDashboardIcon}>{'\u{1F49A}'}</Text>
          </View>
          <View style={styles.caregiverDashboardTextWrap}>
            <Text style={styles.caregiverDashboardTitle}>Quick Care</Text>
            <Text style={styles.caregiverDashboardSubtitle}>
              Open risk prediction summary and checks for the elder.
            </Text>
          </View>
          <Text style={[styles.caregiverDashboardArrow, styles.caregiverQuickCareArrow]}>{'\u203A'}</Text>
        </TouchableOpacity>

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
                <Text style={styles.caregiverToolIcon}>{item.icon}</Text>
                <Text style={styles.caregiverToolLabel}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.quickActionRow}>
          <TouchableOpacity style={styles.profileButton} onPress={onOpenProfile}>
            <Text style={styles.profileButtonText}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
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
            <Text style={styles.addMedicineTitle}>Add Medicine</Text>
            <View style={styles.addMedicineHeaderSpacer} />
          </View>

          <View style={styles.addMedicineHintCard}>
            <Text style={styles.addMedicineHintTitle}>How would you like to add your medicine today?</Text>
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
              <Text style={styles.addMedicineOptionTitle}>Scan Pharmacy Receipt</Text>
              <Text style={styles.addMedicineOptionSubtitle}>Capture your pharmacy receipt details</Text>
            </View>
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
            <View style={styles.addMedicineOptionIconWrap}>
              <Text style={styles.addMedicineOptionIcon}>⌨️</Text>
            </View>
            <View style={styles.addMedicineOptionTextWrap}>
              <Text style={styles.addMedicineOptionTitle}>Manual Entry</Text>
              <Text style={styles.addMedicineOptionSubtitle}>Type in the details yourself</Text>
            </View>
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

    return (
      <ScrollView
        style={styles.reminderScroll}
        contentContainerStyle={styles.reminderContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.reminderTopBar}>
          <View style={styles.reminderLogoPill}>
            <Image source={elderMedsLogo} style={styles.reminderLogo} resizeMode="contain" />
          </View>

          <View style={styles.reminderTopActions}>
            <TouchableOpacity
              style={[styles.reminderTopIconButton, styles.reminderProfileButton]}
              onPress={() => onOpenProfile?.()}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              accessibilityHint="Opens your ElderMeds profile"
            >
              <Text style={styles.reminderTopIcon}>{'\u{1F464}'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reminderTopIconButton, styles.reminderHomeButton]}
              onPress={() => {
                setShowReminderMenu(false);
                setActiveReminderView('menu');
              }}
              activeOpacity={0.86}
              accessibilityRole="button"
              accessibilityLabel="Back to home"
              accessibilityHint="Returns to the main home menu"
            >
              <Text style={styles.reminderTopIcon}>{'\u{1F3E0}'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.reminderMenuHeading}>Reminder Menu</Text>

        <View style={styles.reminderHeroBanner}>
          <View style={styles.reminderHeroIconTile}>
            <Text style={styles.reminderHeroIcon}>{'\u{1F514}'}</Text>
          </View>
          <Text
            style={[styles.reminderTitle, { fontSize: 34 * textScale, lineHeight: 42 * textScale }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Medicine{`\n`}Reminder
          </Text>
        </View>

        <View style={styles.reminderActionHeader}>
          <Text style={styles.reminderInfoText}>Choose Action</Text>
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
          {availableReminderMenuItems.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={[
                styles.reminderButton,
                {
                  backgroundColor: item.cardColor,
                  borderColor: item.borderColor,
                },
              ]}
              activeOpacity={0.86}
              onPress={() => handleReminderMenuPress(item.title)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              accessibilityHint={item.subtitle}
            >
              <View style={[styles.reminderButtonIconWrap, { backgroundColor: item.iconBg }]}>
                <Text style={[styles.reminderButtonIcon, item.isTextIcon && styles.reminderButtonTextIcon]}>
                  {item.icon}
                </Text>
              </View>
              <View style={styles.reminderButtonTextWrap}>
                <Text
                  style={[styles.reminderButtonText, { fontSize: 22 * textScale, lineHeight: 28 * textScale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.reminderButtonSubText, { fontSize: 16 * textScale, lineHeight: 22 * textScale }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                >
                  {item.subtitle}
                </Text>
              </View>
              <View style={[styles.reminderButtonArrowWrap, { borderColor: item.borderColor }]}>
                <Text style={[styles.reminderButtonArrow, { color: item.arrowColor }]}>{'\u203A'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  const todayLabel = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const firstName = String(user?.fullName || '').trim().split(/\s+/)[0] || 'there';

  return (
    <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeContent} showsVerticalScrollIndicator={false}>
      <View style={styles.homeTopBar}>
        <View style={styles.homeLogoPill}>
          <Image source={elderMedsLogo} style={styles.homeBrandLogo} resizeMode="contain" />
        </View>
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
          <Text
            style={styles.homeHeroTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            Good day, {firstName}
          </Text>
          <Text style={styles.homeHeroSubtitle}>Your medicine care is ready when you are.</Text>
        </View>
        <View style={styles.homeHeroBadge}>
          <Text style={styles.homeHeroBadgeIcon}>❤</Text>
          <Text style={styles.homeHeroBadgeText}>Care</Text>
        </View>
      </View>

      {isLocalMode ? (
        <View style={styles.localModeBanner}>
          <Text style={styles.localModeTitle}>Saved On This Device</Text>
          <Text style={styles.localModeText}>
            The shared database is unavailable right now, so this account and its new changes are being stored on this phone.
          </Text>
        </View>
      ) : null}

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
          <Text
            style={styles.homePrimaryTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            Medicine Reminder
          </Text>
          <Text style={styles.homePrimarySubtitle} numberOfLines={2}>Open today schedule and medicine tools.</Text>
        </View>
        <View style={styles.homePrimaryArrowWrap}>
          <Text style={styles.homePrimaryArrow}>›</Text>
        </View>
      </TouchableOpacity>

      <View style={styles.homeSectionHeader}>
        <View>
          <Text style={styles.homeSectionTitle}>More Care Tools</Text>
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
                backgroundColor: item.cardColor,
                borderColor: item.borderColor,
              },
            ]}
            activeOpacity={0.88}
            onPress={() => handleButtonPress(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint="Medicine care option"
          >
            <View style={[styles.homeActionIconWrap, { backgroundColor: item.iconBg }]}>
              <Text style={styles.homeActionIcon}>{item.icon}</Text>
            </View>
            <View style={styles.homeActionTextWrap}>
              <Text
                style={styles.homeActionTitle}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.label}
              </Text>
              <Text style={styles.homeActionSubtitle} numberOfLines={1}>Care option</Text>
            </View>
            <View style={[styles.homeActionArrowWrap, { borderColor: item.borderColor }]}>
              <Text style={[styles.homeActionHelper, { color: item.arrowColor }]}>{'\u203A'}</Text>
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
    backgroundColor: '#f7efe4',
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
    backgroundColor: '#fffdf7',
    borderWidth: 1,
    borderColor: '#eadfcd',
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
    backgroundColor: '#fffdf8',
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
    backgroundColor: '#fffdf8',
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
    borderColor: '#2f6654',
    borderRightWidth: 0,
  },
  homeTopLogoutArrow: {
    position: 'absolute',
    right: 0,
    color: '#2f6654',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '900',
  },
  homeTopLogoutText: {
    color: '#2f6654',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  homeHeroCard: {
    minHeight: 154,
    borderRadius: 24,
    backgroundColor: '#2f6654',
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
    color: '#2f6654',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
  },
  homeHeroBadgeText: {
    color: '#2f6654',
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
    color: '#2f6654',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  homePrimaryTitle: {
    color: '#18352f',
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
    color: '#27231f',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  homeSectionSubtitle: {
    color: '#5e5143',
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
    color: '#18352f',
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
    paddingTop: Platform.OS === 'android' ? 28 : 22,
    paddingBottom: 118,
    paddingHorizontal: 22,
  },
  caregiverPage: {
    flex: 1,
    backgroundColor: '#EEF7F8',
  },
  caregiverContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 38 : 24,
    paddingBottom: 132,
    backgroundColor: '#EEF7F8',
  },
  caregiverHeaderCard: {
    minHeight: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D6EEF3',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#0F5E73',
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
    borderColor: '#E3EDF1',
    shadowColor: '#0F5E73',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  caregiverToolsSubtitle: {
    marginTop: -4,
    marginBottom: 12,
    fontSize: 12,
    color: '#5e7183',
    fontWeight: '600',
    lineHeight: 17,
  },
  caregiverToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  caregiverAssistantCard: {
    minHeight: 88,
    backgroundColor: '#eaf4ff',
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
    backgroundColor: '#1f6894',
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
    color: '#21455f',
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
    color: '#1f6894',
    fontWeight: '900',
  },
  caregiverToolButton: {
    width: '48%',
    minHeight: 92,
    backgroundColor: '#f4f9ff',
    borderWidth: 1,
    borderColor: '#bfd8ef',
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
    color: '#21455f',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
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
    fontSize: 15,
    lineHeight: 20,
    color: '#243848',
    fontWeight: '900',
    marginBottom: 12,
    textTransform: 'uppercase',
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
    backgroundColor: '#edf4fb',
  },
  caregiverTimelineExpandButtonText: {
    color: '#2b72b8',
    fontSize: 12,
    fontWeight: '700',
  },
  reminderScroll: {
    flex: 1,
    backgroundColor: '#f7efe4',
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
    backgroundColor: '#fffdf7',
    borderWidth: 1,
    borderColor: '#eadfcd',
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
    backgroundColor: '#fffdf8',
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
    color: '#27231f',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    marginBottom: 20,
  },
  reminderHeroBanner: {
    minHeight: 156,
    borderRadius: 24,
    backgroundColor: '#2f6654',
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
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
    borderWidth: 1,
    borderColor: '#e3d6c3',
  },
  textModeButtonActive: {
    backgroundColor: '#2f6654',
    borderColor: '#2f6654',
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
    color: '#18352f',
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
  addMedicineContainer: {
    flexGrow: 1,
    backgroundColor: '#f4f6f8',
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 24,
  },
  addMedicineHeader: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e7ebef',
    marginBottom: 12,
  },
  addMedicineBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f5fa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMedicineBackIcon: {
    fontSize: 24,
    color: '#4c6175',
    marginTop: -2,
  },
  addMedicineTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e2a35',
  },
  addMedicineHeaderSpacer: {
    width: 34,
    height: 34,
  },
  addMedicineHintCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6eaef',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  addMedicineHintTitle: {
    fontSize: 20,
    lineHeight: 24,
    color: '#2a3c4c',
    fontWeight: '600',
  },
  addMedicineOptionCard: {
    minHeight: 90,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e5ea',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addMedicineOptionCardPrimary: {
    borderColor: '#3c98d6',
    backgroundColor: '#f4fbff',
  },
  addMedicineOptionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addMedicineOptionIconWrapPrimary: {
    backgroundColor: '#2f8fd0',
  },
  addMedicineOptionIcon: {
    fontSize: 22,
  },
  addMedicineOptionTextWrap: {
    flex: 1,
  },
  addMedicineOptionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1c2b36',
  },
  addMedicineOptionSubtitle: {
    marginTop: 2,
    fontSize: 16,
    color: '#556472',
  },
});

export default HomeScreen;
