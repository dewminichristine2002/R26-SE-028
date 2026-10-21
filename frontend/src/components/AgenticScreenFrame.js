import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const AgenticScreenFrame = ({ active = false, pulseKey = '' }) => {
  const [visible, setVisible] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;

    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      setVisible(false);
      return undefined;
    }

    pulse.stopAnimation();
    pulse.setValue(0);
    setVisible(true);

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 4 }
    );

    animation.start(({ finished }) => {
      if (finished && mounted) {
        setVisible(false);
      }
    });

    return () => {
      mounted = false;
      animation.stop();
    };
  }, [active, pulse, pulseKey]);

  if (!visible) {
    return null;
  }

  const frameOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1, 0.5],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.18, 0.68, 0.26],
  });
  const frameScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.992, 1.01],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.005, 1.03],
  });

  return (
    <View pointerEvents="none" style={styles.host}>
      <Animated.View
        style={[
          styles.haloFrame,
          {
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.neonFrame,
          {
            opacity: frameOpacity,
            transform: [{ scale: frameScale }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  neonFrame: {
    position: 'absolute',
    top: 10,
    right: 8,
    bottom: 10,
    left: 8,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#22C55E',
    shadowColor: '#22C55E',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 16,
  },
  haloFrame: {
    position: 'absolute',
    top: 6,
    right: 4,
    bottom: 6,
    left: 4,
    borderRadius: 34,
    borderWidth: 6,
    borderColor: '#86EFAC',
    shadowColor: '#22C55E',
    shadowOpacity: 0.9,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
});

export default AgenticScreenFrame;
