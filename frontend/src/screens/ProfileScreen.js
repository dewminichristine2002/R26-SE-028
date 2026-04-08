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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Profile</Text>
      <Text style={styles.subtitle}>Personal details for ElderMeds reminders</Text>

      <View style={styles.profileSection}>
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

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#edf4fb',
    flexGrow: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 6,
    color: '#0a4b70',
  },
  subtitle: {
    color: '#4c6d82',
    marginBottom: 16,
    fontSize: 14,
  },
  profileSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  label: {
    fontSize: 13,
    color: '#3f6076',
    marginBottom: 6,
    marginTop: 8,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4e1ec',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#12354d',
    backgroundColor: '#f9fcff',
  },
  readOnlyInput: {
    backgroundColor: '#eef4f8',
    color: '#6a7e8f',
  },
  saveButton: {
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#1f6894',
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  backButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f6894',
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#1f6894',
    fontWeight: '700',
    fontSize: 15,
  },
  logoutButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: '#dd4d4d',
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default ProfileScreen;
