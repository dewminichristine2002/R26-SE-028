import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_RIGHT = 16;
const DEFAULT_BOTTOM = 20;
const SCREEN_MARGIN = 8;
const DRAG_THRESHOLD = 6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const AssistantFAB = ({ onPress, label = 'Ask assistant', visible = true, bottomOffset = DEFAULT_BOTTOM }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const offsetRef = useRef({ x: 0, y: 0 });
  const [buttonSize, setButtonSize] = useState({ width: 60, height: 60 });

  const getBounds = useCallback(() => {
    const buttonWidth = buttonSize.width || 60;
    const buttonHeight = buttonSize.height || 60;
    const baseLeft = screenWidth - buttonWidth - DEFAULT_RIGHT;
    const baseTop = screenHeight - buttonHeight - bottomOffset;

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
  }, [bottomOffset, buttonSize.height, buttonSize.width, screenHeight, screenWidth]);

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
      style={[styles.wrapper, { bottom: bottomOffset, transform: position.getTranslateTransform() }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Double tap to open. Drag to move this helper bubble."
        onPress={onPress}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Ionicons name="chatbubble-ellipses" size={27} color="#FFFFFF" />
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
    padding: 4,
    borderRadius: 25,
    backgroundColor: '#E5F8ED',
    borderWidth: 2,
    borderColor: '#A8E3C2',
  },
  button: {
    backgroundColor: '#0F885E',
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#075C42',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
    borderWidth: 1,
    borderColor: '#08724F',
  },
  buttonPressed: {
    backgroundColor: '#086C4D',
  },
});

export default AssistantFAB;
