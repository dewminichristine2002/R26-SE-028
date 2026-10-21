import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const green = '#275C4B';
const tabs = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'medicines', label: 'Meds', accessibilityLabel: 'Medicines', icon: 'medkit-outline', activeIcon: 'medkit' },
  { key: 'safety', label: 'Safety', accessibilityLabel: 'Medicine safety', icon: 'shield-checkmark-outline', activeIcon: 'shield-checkmark' },
  { key: 'overview', label: 'Overview', icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'care', label: 'Care', icon: 'heart-outline', activeIcon: 'heart' },
  { key: 'wellness', label: 'Wellness', icon: 'leaf-outline', activeIcon: 'leaf' },
];

export default function AppTabBar({ activeTab, onSelect }) {
  return (
    <View style={styles.bar}>
      <View style={styles.inner}>
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.accessibilityLabel || tab.label}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.key)}
              style={({ pressed }) => [styles.tab, active && styles.activeTab, pressed && styles.pressed]}
            >
              <Ionicons name={active ? tab.activeIcon : tab.icon} size={24} color={active ? green : '#64756D'} />
              <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E1E7E0', paddingTop: 7, paddingBottom: Platform.OS === 'ios' ? 15 : 7 },
  inner: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 7 },
  tab: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingHorizontal: 2 },
  activeTab: { backgroundColor: '#EAF4EE' },
  pressed: { opacity: 0.7 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#64756D', marginTop: 4, textAlign: 'center' },
  activeLabel: { color: green, fontWeight: '900' },
});
