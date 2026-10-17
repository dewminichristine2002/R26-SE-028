import React, { createContext, useContext } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const HeaderAccountContext = createContext(null);

export default function HeaderAccountActions() {
  const account = useContext(HeaderAccountContext);
  if (!account) return null;

  return (
    <View style={styles.actions}>
      <Pressable
        onPress={account.onOpenProfile}
        accessibilityRole="button"
        accessibilityLabel="Profile"
        accessibilityHint="View and edit your profile"
        accessibilityState={{ selected: account.isProfileActive }}
        disabled={account.isProfileActive}
        hitSlop={6}
        style={({ pressed }) => [styles.button, account.isProfileActive && styles.active, pressed && styles.pressed]}
      >
        <Ionicons name="person-outline" size={18} color="#275C4B" />
      </Pressable>
      <Pressable
        onPress={account.onLogout}
        accessibilityRole="button"
        accessibilityLabel="Log out"
        accessibilityHint="Sign out of ElderMeds"
        hitSlop={6}
        style={({ pressed }) => [styles.button, styles.logout, pressed && styles.pressed]}
      >
        <Ionicons name="log-out-outline" size={18} color="#8B4247" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 5, flexShrink: 0 },
  button: { width: 33, height: 33, borderRadius: 11, backgroundColor: '#F2FAF5', alignItems: 'center', justifyContent: 'center' },
  logout: { marginLeft: 5, backgroundColor: '#FFF5F5' },
  active: { borderWidth: 2, borderColor: '#83D1B8' },
  pressed: { opacity: 0.68 },
});
