import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

const DEFAULT_RIGHT = 16;
const DEFAULT_BOTTOM = 20;
const SCREEN_MARGIN = 8;
const DRAG_THRESHOLD = 6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const AssistantFAB = ({ onPress, label = 'Ask me', visible = true }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offsetRef = useRef({ x: 0, y: 0 });
  const [buttonSize, setButtonSize] = useState({ width: 176, height: 68 });

  const getBounds = useCallback(() => {
    const buttonWidth = buttonSize.width || 176;
    const buttonHeight = buttonSize.height || 68;
    const baseLeft = screenWidth - buttonWidth - DEFAULT_RIGHT;
    const baseTop = screenHeight - buttonHeight - DEFAULT_BOTTOM;

    const minX = SCREEN_MARGIN - baseLeft;
    const maxX = screenWidth - SCREEN_MARGIN - buttonWidth - baseLeft;
    const minY = SCREEN_MARGIN - baseTop;
    const maxY = screenHeight - SCREEN_MARGIN - buttonHeight - baseTop;

    return {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minY: Math.min(minY, maxY),
      maxY: Math.max(minY, maxY),
    };
  }, [buttonSize.height, buttonSize.width, screenHeight, screenWidth]);

  const moveTo = useCallback((nextPosition, animated = true) => {
    offsetRef.current = nextPosition;

    if (animated) {
      Animated.spring(position, {
        toValue: nextPosition,
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start();
      return;
    }

    position.setValue(nextPosition);
  }, [position]);

  const clampToScreen = useCallback((value) => {
    const bounds = getBounds();
    return {
      x: clamp(value.x, bounds.minX, bounds.maxX),
      y: clamp(value.y, bounds.minY, bounds.maxY),
    };
  }, [getBounds]);

  useEffect(() => {
    moveTo(clampToScreen(offsetRef.current), true);
  }, [clampToScreen, moveTo]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dx) > DRAG_THRESHOLD || Math.abs(gestureState.dy) > DRAG_THRESHOLD,
    onPanResponderGrant: () => {
      position.stopAnimation();
      position.setOffset(offsetRef.current);
      position.setValue({ x: 0, y: 0 });
    },
    onPanResponderMove: (_, gestureState) => {
      position.setValue({ x: gestureState.dx, y: gestureState.dy });
    },
    onPanResponderRelease: (_, gestureState) => {
      position.flattenOffset();
      const nextPosition = clampToScreen({
        x: offsetRef.current.x + gestureState.dx,
        y: offsetRef.current.y + gestureState.dy,
      });
      moveTo(nextPosition, true);
    },
    onPanResponderTerminate: (_, gestureState) => {
      position.flattenOffset();
      const nextPosition = clampToScreen({
        x: offsetRef.current.x + gestureState.dx,
        y: offsetRef.current.y + gestureState.dy,
      });
      moveTo(nextPosition, true);
    },
  }), [clampToScreen, moveTo, position]);

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      {...panResponder.panHandlers}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width && height && (width !== buttonSize.width || height !== buttonSize.height)) {
          setButtonSize({ width, height });
        }
      }}
      style={[styles.wrapper, { transform: position.getTranslateTransform() }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your health helper"
        accessibilityHint="Double tap to open. Drag to move this helper bubble."
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <View style={styles.iconBubble}>
          <Text style={styles.icon}>{'\u{1F49A}'}</Text>
        </View>
        <View style={styles.textBox}>
          <Text style={styles.title}>{label}</Text>
          <Text style={styles.subtitle}>Health Helper</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: DEFAULT_RIGHT,
    bottom: DEFAULT_BOTTOM,
    zIndex: 999,
    elevation: 14,
  },
  button: {
    backgroundColor: '#2563EB',
    minHeight: 68,
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 2,
    borderColor: '#1D4ED8',
  },
  buttonPressed: {
    backgroundColor: '#1D4ED8',
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  icon: {
    fontSize: 26,
  },
  textBox: {
    paddingRight: 4,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 18,
  },
  subtitle: {
    color: '#DBEAFE',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
});

export default AssistantFAB;
