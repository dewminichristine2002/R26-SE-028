import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

const AgenticGlowCard = ({
  active = false,
  pulseKey = '',
  style,
  highlightStyle,
  borderRadius = 22,
  children,
  ...viewProps
}) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return undefined;
    }

    pulse.setValue(0);
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
      { iterations: 4 }
    );

    animation.start();
    return () => animation.stop();
  }, [active, pulse, pulseKey]);

  const cyanOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.35, 1, 0.45],
  });
  const magentaOpacity = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.2, 0.85, 0.25],
  });
  const cyanScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });
  const magentaScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1.015, 1.045],
  });

  return (
    <Animated.View
      {...viewProps}
      style={[style, active && styles.activeHost, active && highlightStyle]}
    >
      {children}
      {active ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glowBorder,
              {
                borderRadius,
                opacity: cyanOpacity,
                transform: [{ scale: cyanScale }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glowBorder,
              styles.magentaGlow,
              {
                borderRadius,
                opacity: magentaOpacity,
                transform: [{ scale: magentaScale }],
              },
            ]}
          />
        </>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  activeHost: {
    position: 'relative',
    overflow: 'visible',
  },
  glowBorder: {
    position: 'absolute',
    top: -5,
    right: -5,
    bottom: -5,
    left: -5,
    borderWidth: 3,
    borderColor: '#22D3EE',
    shadowColor: '#22D3EE',
    shadowOpacity: 0.95,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  magentaGlow: {
    top: -8,
    right: -8,
    bottom: -8,
    left: -8,
    borderWidth: 2,
    borderColor: '#D946EF',
    shadowColor: '#D946EF',
    shadowRadius: 18,
    elevation: 12,
  },
});

export default AgenticGlowCard;
