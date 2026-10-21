import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n/useTranslation';
import HeaderAccountActions from '../components/HeaderAccountActions';
import { userService } from '../services/userService';

const ProfileScreen = ({ user, onOpenSettings, onProfileUpdated }) => {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    caregiverEmail: user?.caregiverEmail || '',
    caregiverPhone: user?.caregiverPhone || '',
    dateOfBirth: user?.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
    bloodType: user?.bloodType || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await userService.getMyProfile();
        setForm({
          fullName: profile.fullName || '',
          email: profile.email || '',
          phone: profile.phone || '',
          caregiverEmail: profile.caregiverEmail || '',
          caregiverPhone: profile.caregiverPhone || '',
          dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : '',
          bloodType: profile.bloodType || '',
        });
        onProfileUpdated(profile);
      } catch (error) {
        console.error('[ProfileScreen] load profile error:', error.message);
      }
    };

    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!form.fullName.trim()) {
      Alert.alert(t('profile.validationTitle'), t('profile.fullNameRequired'));
      return;
    }

    const ownEmail = String(form.email || '').trim().toLowerCase();
    const caregiverEmail = String(form.caregiverEmail || '').trim().toLowerCase();
    if (caregiverEmail && ownEmail && caregiverEmail === ownEmail) {
      Alert.alert(t('profile.validationTitle'), t('profile.caregiverEmailDifferent'));
      return;
    }

    try {
      setSaving(true);
      const updated = await userService.updateMyProfile({
        fullName: form.fullName,
        phone: form.phone,
        caregiverEmail: form.caregiverEmail,
        caregiverPhone: form.caregiverPhone,
        dateOfBirth: form.dateOfBirth || null,
        bloodType: form.bloodType,
      });
      onProfileUpdated(updated);
      Alert.alert(t('profile.savedTitle'), t('profile.savedMessage'));
    } catch (error) {
      const message = error.response?.data?.error || error.message || t('profile.saveFailedFallback');
      Alert.alert(t('profile.errorTitle'), message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('profile.myProfile')}</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onOpenSettings}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('profile.openSettings')}
            accessibilityHint={t('profile.openSettingsHint')}
          >
            <Ionicons name="settings-outline" size={19} color="#275C4B" />
          </TouchableOpacity>
          <HeaderAccountActions />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHero}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{(form.fullName || 'U').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroName}>{form.fullName || t('profile.userFallback')}</Text>
          <Text style={styles.heroSubText}>{form.email || t('profile.noEmail')}</Text>
        </View>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>{t('profile.personalDetails')}</Text>
        <Text style={styles.label}>{t('profile.fullName')}</Text>
        <TextInput
          style={styles.input}
          value={form.fullName}
          onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
          placeholder={t('profile.fullNamePlaceholder')}
        />

        <Text style={styles.label}>{t('profile.email')}</Text>
        <TextInput style={[styles.input, styles.readOnlyInput]} value={form.email} editable={false} />

        <Text style={styles.label}>{t('profile.phone')}</Text>
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
          placeholder={t('profile.phonePlaceholder')}
        />

        <Text style={styles.label}>{t('profile.caregiverEmail')}</Text>
        <TextInput
          style={styles.input}
          value={form.caregiverEmail}
          onChangeText={(value) => setForm((prev) => ({ ...prev, caregiverEmail: value }))}
          placeholder={t('profile.caregiverEmailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          importantForAutofill="yes"
        />

        <Text style={styles.label}>{t('profile.caregiverPhone')}</Text>
        <TextInput
          style={styles.input}
          value={form.caregiverPhone}
          onChangeText={(value) => setForm((prev) => ({ ...prev, caregiverPhone: value }))}
          placeholder={t('profile.caregiverPhonePlaceholder')}
        />
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>{t('profile.healthDetails')}</Text>
        <Text style={styles.label}>{t('profile.dateOfBirthFormat')}</Text>
        <TextInput
          style={styles.input}
          value={form.dateOfBirth}
          onChangeText={(value) => setForm((prev) => ({ ...prev, dateOfBirth: value }))}
          placeholder={t('profile.dateOfBirthPlaceholder')}
        />

        <Text style={styles.label}>{t('profile.bloodType')}</Text>
        <TextInput
          style={styles.input}
          value={form.bloodType}
          onChangeText={(value) => setForm((prev) => ({ ...prev, bloodType: value }))}
          placeholder={t('profile.bloodTypePlaceholder')}
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? t('profile.saving') : t('profile.saveProfile')}</Text>
        </TouchableOpacity>

      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 32,
    backgroundColor: '#F7F8F5',
    flexGrow: 1,
  },
  staticHeaderWrap: {
    backgroundColor: '#F7F8F5',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  headerRow: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: '#275C4B',
    borderWidth: 2,
    borderColor: '#E1E7E0',
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#193D31',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'left',
    fontSize: 24,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  settingsButton: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: '#F2FAF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHero: {
    minHeight: 120,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#E1E7E0',
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#193D31',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#275C4B',
    borderWidth: 4,
    borderColor: '#E1E7E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
  },
  heroTextWrap: {
    flex: 1,
  },
  heroName: {
    color: '#193D31',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  heroSubText: {
    marginTop: 6,
    color: '#53645A',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E1E7E0',
    padding: 18,
    marginBottom: 18,
    shadowColor: '#193D31',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    color: '#193D31',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: '#275C4B',
    marginBottom: 10,
    marginTop: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 62,
    borderWidth: 2,
    borderColor: '#2196f3',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: '#1a2332',
    backgroundColor: '#FFFFFF',
    fontWeight: '800',
  },
  readOnlyInput: {
    backgroundColor: '#f0f4f8',
    color: '#5a6f80',
    borderColor: '#E1E7E0',
  },
  saveButton: {
    marginTop: 20,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: '#275C4B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#193D31',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
});

export default ProfileScreen;
