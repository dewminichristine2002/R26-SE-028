import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { userService } from '../services/userService';

const ProfileScreen = ({ user, onBack, onProfileUpdated, onLogout }) => {
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
      Alert.alert('Validation', 'Full name is required.');
      return;
    }

    const ownEmail = String(form.email || '').trim().toLowerCase();
    const caregiverEmail = String(form.caregiverEmail || '').trim().toLowerCase();
    if (caregiverEmail && ownEmail && caregiverEmail === ownEmail) {
      Alert.alert('Validation', 'Caregiver email must be different from your own email.');
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
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Failed to save profile';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.staticHeaderWrap}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>My Profile</Text>
          <TouchableOpacity style={styles.headerHomeButton} onPress={onBack}>
            <Text style={styles.headerHomeText}>🏠</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.profileHero}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{(form.fullName || 'U').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.heroTextWrap}>
          <Text style={styles.heroName}>{form.fullName || 'User'}</Text>
          <Text style={styles.heroSubText}>{form.email || 'No email'}</Text>
        </View>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Personal Details</Text>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={form.fullName}
          onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
          placeholder="Your full name"
        />

        <Text style={styles.label}>Email</Text>
        <TextInput style={[styles.input, styles.readOnlyInput]} value={form.email} editable={false} />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
          placeholder="e.g. +94 77 123 4567"
        />

        <Text style={styles.label}>Caregiver Email</Text>
        <TextInput
          style={styles.input}
          value={form.caregiverEmail}
          onChangeText={(value) => setForm((prev) => ({ ...prev, caregiverEmail: value }))}
          placeholder="caregiver@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          importantForAutofill="yes"
        />

        <Text style={styles.label}>Caregiver Phone</Text>
        <TextInput
          style={styles.input}
          value={form.caregiverPhone}
          onChangeText={(value) => setForm((prev) => ({ ...prev, caregiverPhone: value }))}
          placeholder="Used for caregiver login"
        />
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.sectionTitle}>Health Details</Text>
        <Text style={styles.label}>Date of Birth (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={form.dateOfBirth}
          onChangeText={(value) => setForm((prev) => ({ ...prev, dateOfBirth: value }))}
          placeholder="1950-01-15"
        />

        <Text style={styles.label}>Blood Type</Text>
        <TextInput
          style={styles.input}
          value={form.bloodType}
          onChangeText={(value) => setForm((prev) => ({ ...prev, bloodType: value }))}
          placeholder="e.g. O+"
        />

        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#eaf4ff',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 32,
    backgroundColor: '#eaf4ff',
    flexGrow: 1,
  },
  staticHeaderWrap: {
    backgroundColor: '#eaf4ff',
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  headerRow: {
    minHeight: 60,
    borderRadius: 20,
    backgroundColor: '#1f6894',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 30,
    color: '#ffffff',
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  headerHomeButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d5eafa',
  },
  headerHomeText: {
    fontSize: 26,
    lineHeight: 30,
    color: '#1f6894',
    marginTop: -2,
    fontWeight: '900',
  },
  profileHero: {
    minHeight: 120,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#b9d9f2',
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1f6894',
    borderWidth: 4,
    borderColor: '#d5eafa',
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
    color: '#12354d',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  heroSubText: {
    marginTop: 6,
    color: '#4c6d82',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#d5eafa',
    padding: 18,
    marginBottom: 18,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionTitle: {
    color: '#12354d',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '900',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    color: '#1f6894',
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
    backgroundColor: '#f9fcff',
    fontWeight: '800',
  },
  readOnlyInput: {
    backgroundColor: '#f0f4f8',
    color: '#5a6f80',
    borderColor: '#b9d9f2',
  },
  saveButton: {
    marginTop: 20,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: '#1f6894',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f4f7a',
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
  logoutButton: {
    marginTop: 12,
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: '#d32f2f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#b71c1c',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 18,
  },
});

export default ProfileScreen;
