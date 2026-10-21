import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authService } from '../services/authService';
import BrandLockup from '../components/BrandLockup';

const RegisterScreen = ({ onRegisterSuccess, onBackToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert('Missing Fields', 'Please enter name, email and password.');
      return;
    }

    try {
      setLoading(true);
      const result = await authService.register({ fullName, email, password });
      onRegisterSuccess(result.user);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Registration failed';
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <BrandLockup />
        <View style={styles.card}>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Keep your medicines and reminders together.</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#718079"
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#718079"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="#718079"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Creating...' : 'Create account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onBackToLogin} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F8F5',
  },
  container: {
    flexGrow: 1,
    backgroundColor: '#F7F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 34,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    padding: 22,
    shadowColor: '#1C3E31',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#193D31',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    color: '#53645A',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  label: {
    color: '#193D31',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#E1E7E0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#193D31',
    backgroundColor: '#FFFFFF',
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 62,
    marginTop: 6,
    backgroundColor: '#275C4B',
    borderRadius: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  secondaryButton: {
    minHeight: 60,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#275C4B',
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#275C4B',
    fontWeight: '900',
    fontSize: 17,
  },
});

export default RegisterScreen;
