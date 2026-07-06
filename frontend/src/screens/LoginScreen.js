import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authService } from '../services/authService';

const elderMedsLogo = require('../../assets/logo.png');

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
        <View style={styles.logoWrap}>
          <Image source={elderMedsLogo} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Use your account details to continue medicine care.</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#8a97a4"
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
              placeholderTextColor="#8a97a4"
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
            <Text style={styles.primaryButtonText}>{loading ? 'Signing in...' : 'Login'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onNavigateRegister} disabled={loading}>
            <Text style={styles.secondaryButtonText}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#eaf4ff',
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#b9d9f2',
    padding: 22,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#12354d',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: '#4c6d82',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  label: {
    color: '#12354d',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    marginBottom: 7,
  },
  input: {
    minHeight: 54,
    borderWidth: 2,
    borderColor: '#d5eafa',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 0,
    marginBottom: 14,
    fontSize: 16,
    color: '#12354d',
    backgroundColor: '#f9fcff',
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
    backgroundColor: '#eaf4ff',
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
    borderColor: '#1f6894',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordEyePupil: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1f6894',
  },
  passwordEyeSlash: {
    position: 'absolute',
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#1f6894',
    transform: [{ rotate: '45deg' }],
  },
  primaryButton: {
    minHeight: 56,
    marginTop: 4,
    backgroundColor: '#1f6894',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 54,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#1f6894',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#1f6894',
    fontWeight: '900',
    fontSize: 15,
  },
});

export default LoginScreen;
