import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import EmotionalSupportNavigator from './src/features/emotionalSupport/EmotionalSupportNavigator';

const Stack = createStackNavigator();

function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F3EC" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>ElderMeds</Text>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.subtitle}>
          Open your emotional and cognitive engagement support module from here.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate('EmotionalSupport')}
        >
          <Text style={styles.primaryButtonText}>Emotional Support</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="EmotionalSupport"
          component={EmotionalSupportNavigator}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F3EC',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#7D6545',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#2F2418',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#5D5447',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#31584C',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
