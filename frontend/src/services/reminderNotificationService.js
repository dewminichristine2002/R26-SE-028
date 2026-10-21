import { Platform } from 'react-native';
import { medicationService } from './medicationService';
import { routineService } from './routineService';

let NotificationsModule = null;

try {
  NotificationsModule = require('expo-notifications');
} catch (error) {
  console.log('[ReminderNotification] expo-notifications is not available in this build');
}

const CHANNEL_ID = 'eldermeds-reminders-v12';
const SOUND_FILE = 'medicine_reminder.mp3';
const OFFSET_MINUTES = 30;

if (NotificationsModule) {
  NotificationsModule.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const parseTime12H = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }

  // Supports "08:00 AM", "8:00 am", "13:00", and "13.00" formats.
  const normalized = text.replace('.', ':');
  const match = normalized.match(/^(\d{1,2})\s*[:]\s*(\d{1,2})(?:\s*(AM|PM))?$/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = (match[3] || '').toUpperCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (period) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (period === 'AM') {
      hour = hour === 12 ? 0 : hour;
    } else {
      hour = hour === 12 ? 12 : hour + 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return { hour, minute };
};

const applyOffset = ({ hour, minute }, offsetMinutes) => {
  const totalMinutes = hour * 60 + minute + offsetMinutes;
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;

  return {
    hour: Math.floor(wrapped / 60),
    minute: wrapped % 60,
  };
};

const parseTakeWith = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const mapTokenToRoutineKey = (token) => {
  if (token.includes('breakfast') || token.includes('morning')) {
    return 'breakfast';
  }
  if (token.includes('lunch') || token.includes('noon')) {
    return 'lunch';
  }
  if (token.includes('dinner') || token.includes('evening')) {
    return 'dinner';
  }
  if (token.includes('sleep') || token.includes('bed')) {
    return 'sleep';
  }
  return null;
};

const resolveRoutineKeys = (takeWithValue) => {
  const keys = parseTakeWith(takeWithValue)
    .map(mapTokenToRoutineKey)
    .filter(Boolean);

  return Array.from(new Set(keys));
};

const ensurePermissions = async () => {
  if (!NotificationsModule) {
    return false;
  }

  const existing = await NotificationsModule.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }

  const requested = await NotificationsModule.requestPermissionsAsync();
  return !!requested.granted;
};

const ensureAndroidChannel = async () => {
  if (!NotificationsModule || Platform.OS !== 'android') {
    return;
  }

  await NotificationsModule.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Medicine Reminders',
    importance: NotificationsModule.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: NotificationsModule.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: {
      usage: NotificationsModule.AndroidAudioUsage.ALARM,
      contentType: NotificationsModule.AndroidAudioContentType.SONIFICATION,
    },
    sound: SOUND_FILE,
  });
};

const scheduleOneReminder = async ({ medication, routineKey, reminderTime }) => {
  if (!NotificationsModule) {
    return;
  }

  const medicineName = medication?.medicine_name || 'Medicine';
  const dosageMg = Number(medication?.dosage_mg);
  const amount = Number(medication?.daily_amount) || 1;
  const amountText = amount === 1 ? '1 tablet' : `${amount} tablets`;
  const dosageText = Number.isFinite(dosageMg) && dosageMg > 0 ? ` (${dosageMg} mg)` : '';
  const title = 'Medicine Reminder';
  const body = `It is time to take ${medicineName}${dosageText}. Take ${amountText}.`;

  await NotificationsModule.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: SOUND_FILE,
      data: {
        type: 'medicine-reminder',
        medicationId: medication?.id,
        routineKey,
      },
    },
    trigger: {
      hour: reminderTime.hour,
      minute: reminderTime.minute,
      repeats: true,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
};

const createReminderSlots = (medications, mealTimes) => {
  const slots = [];

  medications.forEach((medication) => {
    const routineKeys = resolveRoutineKeys(medication?.take_with);
    const offset = String(medication?.intake_timing || '').toLowerCase() === 'before' ? -OFFSET_MINUTES : OFFSET_MINUTES;

    routineKeys.forEach((routineKey) => {
      const sourceTime = parseTime12H(mealTimes?.[routineKey]);
      if (!sourceTime) {
        return;
      }

      slots.push({
        medication,
        routineKey,
        reminderTime: applyOffset(sourceTime, offset),
      });
    });
  });

  return slots;
};

export const reminderNotificationService = {
  async rescheduleDailyReminders() {
    if (!NotificationsModule) {
      console.log('[ReminderNotification] Notifications module unavailable, skipping schedule');
      return { scheduled: 0, skipped: true };
    }

    const hasPermission = await ensurePermissions();
    if (!hasPermission) {
      console.log('[ReminderNotification] Notification permission denied');
      return { scheduled: 0, skipped: true };
    }

    await ensureAndroidChannel();

    await NotificationsModule.cancelAllScheduledNotificationsAsync();

    const [medications, routine] = await Promise.all([
      medicationService.getMyMedications(),
      routineService.getRoutine(),
    ]);

    const slots = createReminderSlots(medications || [], routine?.mealTimes || {});

    for (const slot of slots) {
      await scheduleOneReminder(slot);
    }

    console.log(`[ReminderNotification] Scheduled ${slots.length} daily reminders`);
    return { scheduled: slots.length, skipped: false };
  },

  async scheduleReminderInMinutes({ minutes, medication, message }) {
    if (!NotificationsModule) {
      console.log('[ReminderNotification] Notifications module unavailable, skipping one-time reminder');
      return { scheduled: false, skipped: true };
    }

    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      throw new Error('Minutes must be a positive number');
    }

    const hasPermission = await ensurePermissions();
    if (!hasPermission) {
      return { scheduled: false, skipped: true, reason: 'permission-denied' };
    }

    await ensureAndroidChannel();

    const medicineName = medication?.medicine_name || 'your medicine';
    const title = 'Reminder';
    const body = message || `Reminder: Please take ${medicineName}.`;
    const triggerDate = new Date(Date.now() + parsedMinutes * 60 * 1000);

    const identifier = await NotificationsModule.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: SOUND_FILE,
        data: {
          type: 'medicine-reminder-manual',
          medicationId: medication?.id,
          minutes: parsedMinutes,
          scheduledFor: triggerDate.toISOString(),
        },
      },
      trigger: Platform.OS === 'android'
        ? {
            date: triggerDate,
            channelId: CHANNEL_ID,
          }
        : triggerDate,
    });

    return { scheduled: true, skipped: false, identifier };
  },
};

export default reminderNotificationService;
