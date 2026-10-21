import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BrandLogo from './BrandLogo';

export default function AppHeader({ onOpenProfile, onLogout, isProfileActive = false, backgroundColor = '#F7F8F5' }) {
  const { width } = useWindowDimensions();
  const compact = width < 360;

  return (
    <View style={[styles.bar, { backgroundColor }]}>
      <View style={styles.inner}>
        <View style={styles.brand} accessible accessibilityRole="image" accessibilityLabel="ElderMeds logo">
          {width >= 320 && <BrandLogo variant={width >= 400 ? 'headerSymbolTransparent' : 'headerSymbolMediumTransparent'} accessible={false} />}
          <View style={styles.brandCopy}>
            <BrandLogo variant={width >= 400 ? 'headerWordmarkTransparent' : compact ? 'headerWordmarkCompactTransparent' : 'headerWordmarkMediumTransparent'} accessible={false} />
            {!compact && <Text style={styles.tagline} numberOfLines={1}>Your care, all in one place.</Text>}
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.iconButton, styles.profileButton, isProfileActive && styles.profileActive]}
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            accessibilityHint="View and edit your profile"
            accessibilityState={{ selected: isProfileActive }}
          >
            <Ionicons name="person-outline" size={22} color="#327FC3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.logoutButton]}
            onPress={onLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            accessibilityHint="Sign out of ElderMeds"
          >
            <Ionicons name="log-out-outline" size={22} color="#8B4247" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%' },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', minHeight: 76, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  brandCopy: { justifyContent: 'center', flexShrink: 1 },
  tagline: { color: '#5B7771', fontSize: 11, lineHeight: 16, marginTop: -1 },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileButton: { backgroundColor: '#ECF6FD', borderColor: '#CFE5F4', marginRight: 8 },
  profileActive: { borderColor: '#327FC3', borderWidth: 2 },
  logoutButton: { backgroundColor: '#FFF8F8', borderColor: '#EEDBDD' },
});
