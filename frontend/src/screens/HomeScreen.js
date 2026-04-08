import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const HomeScreen = ({ user, isLocalMode, onOpenProfile, onOpenAllergies, onLogout }) => {
  const menuItems = [
    { id: 1, label: 'Reminder', icon: '\u{1F514}' },
    { id: 2, label: 'Allergy', icon: '\u26A0\uFE0F' },
    { id: 3, label: 'Emotions', icon: '\u{1F60A}' },
    { id: 4, label: 'Dashboard', icon: '\u{1F4CA}' },
  ];

  const handleButtonPress = (item) => {
    if (item.label === 'Allergy') {
      onOpenAllergies();
      return;
    }
  };

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
});

export default HomeScreen;
