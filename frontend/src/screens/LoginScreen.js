import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authService } from '../services/authService';
import BrandLockup from '../components/BrandLockup';

const LoginScreen = ({ onLoginSuccess, onNavigateRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter email and password.');
      return;
    }

    try {
      setLoading(true);
      const result = await authService.login({ email, password });
      onLoginSuccess(result.user);
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Login failed';
      Alert.alert('Login Failed', message);
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Use your account details to continue medicine care.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
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

          <Text style={styles.label}>Password or caregiver phone</Text>
          <View style={styles.passwordInputWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Enter password"
              placeholderTextColor="#718079"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              accessibilityHint="Toggles password visibility"
            >
              <View style={styles.passwordToggleIconWrap}>
                <View style={styles.passwordEyeShape}>
                  <View style={styles.passwordEyePupil} />
                </View>
                {showPassword && <View style={styles.passwordEyeSlash} />}
              </View>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.primaryButton, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onNavigateRegister} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Create an account</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 34,
  },
  logoWrap: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    marginBottom: 18,
  },
  logo: {
    width: '100%',
    height: 120,
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
    marginBottom: 20,
    color: '#53645A',
    fontSize: 15,
    lineHeight: 21,
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
    minHeight: 54,
    borderWidth: 2,
    borderColor: '#E1E7E0',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 0,
    marginBottom: 14,
    fontSize: 16,
    color: '#193D31',
    backgroundColor: '#FFFFFF',
    fontWeight: '700',
  },
  passwordInputWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 58,
  },
  passwordToggle: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F7F8F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordToggleIconWrap: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  passwordEyeShape: {
    width: 24,
    height: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#275C4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordEyePupil: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#275C4B',
  },
  passwordEyeSlash: {
    position: 'absolute',
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#275C4B',
    transform: [{ rotate: '45deg' }],
  },
  primaryButton: {
    minHeight: 56,
    marginTop: 4,
    backgroundColor: '#275C4B',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C3E31',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 54,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#275C4B',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#275C4B',
    fontWeight: '900',
    fontSize: 15,
  },
});

export default LoginScreen;
