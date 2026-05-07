import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { Alert, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import RoutineSetupScreen from './RoutineSetupScreen';
import ManualEntryScreen from './ManualEntryScreen';
import MedicineListScreen from './MedicineListScreen';
import MedicineStockScreen from './MedicineStockScreen';
import ScheduleBoardScreen from './ScheduleBoardScreen';
import SafetyCenterScreen from './SafetyCenterScreen';
import ReceiptScanScreen from './ReceiptScanScreen';
import { caregiverAlertService } from '../services/caregiverAlertService';

const HomeScreen = ({ user, isLocalMode, onOpenProfile, onOpenAllergies, onOpenMedicine, onOpenHistory, onOpenEmotionalSupport, onLogout, launchIntent }) => {
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
    { id: 1, label: 'Reminder', icon: '\u{1F514}' },
    { id: 2, label: 'Allergy', icon: '\u26A0\uFE0F' },
    { id: 3, label: 'Emotions', icon: '\u{1F60A}' },
    { id: 4, label: 'Dashboard', icon: '\u{1F4CA}' },
  ];

  const reminderMenuItems = [
    { title: 'Routine Setup', subtitle: 'Set daily medication schedules', icon: '\u{1F4C5}' },
    { title: 'Add Medicine', subtitle: 'Add a new medicine to track', icon: '\u2795' },
    { title: 'Scan Pharmacy Receipt', subtitle: 'Extract medicine details from a receipt', icon: '\u{1F4F7}' },
    { title: 'Medicine List', subtitle: 'View all saved medicines', icon: '\u{1F4DA}' },
    { title: 'Medicine Stock', subtitle: 'Check remaining medicine stock', icon: '\u{1F4E6}' },
    { title: 'Schedule Board', subtitle: 'See the current reminder board', icon: '\u{1F4CB}' },
    { title: 'Safety Center', subtitle: 'Review warnings and safety tips', icon: '\u26A0\uFE0F' },
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
  const criticalAlerts = caregiverAlerts.filter((item) => !item.is_read);
  const recentAlerts = caregiverAlerts.slice(0, 5);
  const timelineItems = isTimelineExpanded ? caregiverTimeline : caregiverTimeline.slice(0, 4);

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
      <ScrollView style={styles.container} contentContainerStyle={styles.caregiverContainer}>
        <View style={styles.caregiverHeaderRow}>
          <View>
            <Text style={styles.title}>Caregiver Alerts</Text>
            <Text style={styles.welcome}>Today notifications for {user?.fullName || 'your patient'}</Text>
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

        {!!criticalAlerts.length && (
          <View style={styles.caregiverCriticalCard}>
            <Text style={styles.caregiverSectionTitle}>Immediate Action Required</Text>
            {criticalAlerts.slice(0, 2).map((alertItem) => (
              <View key={`critical-${alertItem.id}`} style={styles.caregiverCriticalItem}>
                <View style={styles.caregiverCriticalHeader}>
                  <Text style={styles.caregiverCriticalLabel}>{getCaregiverAlertTitle(alertItem)}</Text>
                  <Text style={styles.caregiverCriticalTime}>{formatAlertTime(alertItem.created_at)}</Text>
                </View>
                <Text style={styles.caregiverCriticalMessage}>{alertItem.message}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.caregiverCard}>
          <Text style={styles.caregiverSectionTitle}>Recent Updates</Text>
          {!recentAlerts.length ? (
            <Text style={styles.caregiverEmptyText}>No notifications yet.</Text>
          ) : (
            recentAlerts.map((alertItem) => (
              <View key={`recent-${alertItem.id}`} style={styles.caregiverRecentItem}>
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
              </View>
            ))
          )}
        </View>

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
      return <RoutineSetupScreen onBackToMenu={() => setActiveReminderView('menu')} />;
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
      return <MedicineListScreen onBack={() => setActiveReminderView('menu')} />;
    }

    if (activeReminderView === 'medicine-stock') {
      return <MedicineStockScreen onBack={() => setActiveReminderView('menu')} />;
    }

    if (activeReminderView === 'schedule-board') {
      return <ScheduleBoardScreen user={user} onBack={() => setActiveReminderView('menu')} />;
    }

    if (activeReminderView === 'safety-center') {
      return <SafetyCenterScreen onBack={() => setActiveReminderView('menu')} />;
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
      <Text style={styles.title}>Home</Text>
      <Text style={styles.welcome}>Welcome back!</Text>
      <Text style={styles.userName}>Signed in as {user?.fullName || 'User'}</Text>

      {isLocalMode ? (
        <View style={styles.localModeBanner}>
          <Text style={styles.localModeTitle}>Saved On This Device</Text>
          <Text style={styles.localModeText}>
            The shared database is unavailable right now, so this account and its new changes are being stored on this phone.
          </Text>
        </View>
      ) : null}

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
          <TouchableOpacity key={item.id} style={styles.button} onPress={() => handleButtonPress(item)}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.buttonLabel}>{item.label}</Text>
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
  localModeBanner: {
    backgroundColor: '#fff6da',
    borderColor: '#efd28a',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
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
  caregiverContainer: {
    paddingBottom: 24,
    backgroundColor: '#f6f7f9',
  },
  caregiverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  caregiverNotificationButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontSize: 20,
  },
  caregiverCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
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
    borderRadius: 12,
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
    fontSize: 14,
    color: '#2e3d4f',
    fontWeight: '700',
    marginBottom: 10,
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
    marginBottom: 12,
  },
  caregiverRecentDotWrap: {
    width: 20,
    alignItems: 'center',
    paddingTop: 1,
  },
  caregiverRecentDot: {
    color: '#3f6ba8',
    fontSize: 12,
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
    color: '#243542',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 8,
  },
  caregiverRecentTime: {
    color: '#678090',
    fontSize: 11,
  },
  caregiverRecentMessage: {
    color: '#405361',
    fontSize: 12,
    lineHeight: 17,
  },
  caregiverEmptyText: {
    color: '#687f90',
    fontSize: 13,
  },
  caregiverTimelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  caregiverTimelineDayLabel: {
    marginTop: 10,
    marginBottom: 4,
    color: '#5f7280',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  caregiverTimelineLink: {
    color: '#2b72b8',
    fontSize: 12,
    fontWeight: '700',
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
    color: '#324653',
    fontSize: 14,
    lineHeight: 17,
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
