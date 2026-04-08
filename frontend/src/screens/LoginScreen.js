import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authService } from '../services/authService';

const LoginScreen = ({ onLoginSuccess, onNavigateRegister }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Welcome to ElderMeds</Text>
        <Text style={styles.subtitle}>Login with user email/password or caregiver email/phone</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
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

        <TextInput
          style={styles.input}
          placeholder="Password (or caregiver phone)"
          placeholderTextColor="#8a97a4"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
          <Text style={styles.primaryButtonText}>{loading ? 'Signing in...' : 'Login'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={onNavigateRegister} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf4fb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#0f4f7a',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0a4b70',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    color: '#4c6d82',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d4e1ec',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 15,
    color: '#12354d',
    backgroundColor: '#f9fcff',
  },
  primaryButton: {
    marginTop: 6,
    backgroundColor: '#1f6894',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1f6894',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#1f6894',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default LoginScreen;
