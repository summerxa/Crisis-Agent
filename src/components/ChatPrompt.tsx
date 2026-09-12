import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ChatPromptCorner } from '../types';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

type ChatPromptProps = {
  corner: ChatPromptCorner;
  onCornerChange: (corner: ChatPromptCorner) => void;
  onPress: () => void;
  topBoundaryInset?: number;
  visible?: boolean;
};

const EDGE_INSET = 16;
const TAP_MOVEMENT_THRESHOLD = 6;
const SNAP_TENSION = 140;
const SNAP_FRICTION = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function canPlace(container: Size, prompt: Size) {
  return container.width > 0 && container.height > 0 && prompt.width > 0 && prompt.height > 0;
}

function getBounds(container: Size, prompt: Size, topBoundaryInset: number) {
  const minY = EDGE_INSET + topBoundaryInset;
  return {
    minX: EDGE_INSET,
    minY,
    maxX: Math.max(EDGE_INSET, container.width - prompt.width - EDGE_INSET),
    maxY: Math.max(minY, container.height - prompt.height - EDGE_INSET),
  };
}

function pointForCorner(corner: ChatPromptCorner, container: Size, prompt: Size, topBoundaryInset: number): Point {
  const { minX, minY, maxX, maxY } = getBounds(container, prompt, topBoundaryInset);
  switch (corner) {
    case 'topLeft':
      return { x: minX, y: minY };
    case 'topRight':
      return { x: maxX, y: minY };
    case 'bottomLeft':
      return { x: minX, y: maxY };
    case 'bottomRight':
      return { x: maxX, y: maxY };
  }
}

function nearestCorner(point: Point, container: Size, prompt: Size): ChatPromptCorner {
  const centerX = point.x + prompt.width / 2;
  const centerY = point.y + prompt.height / 2;
  const horizontal = centerX < container.width / 2 ? 'Left' : 'Right';
  const vertical = centerY < container.height / 2 ? 'top' : 'bottom';
  return `${vertical}${horizontal}` as ChatPromptCorner;
}

export default function ChatPrompt({ corner, onCornerChange, onPress, topBoundaryInset = 0, visible = true }: ChatPromptProps) {
  const pan = useRef(new Animated.ValueXY({ x: EDGE_INSET, y: EDGE_INSET })).current;
  const position = useRef<Point>({ x: EDGE_INSET, y: EDGE_INSET });
  const dragStart = useRef<Point>({ x: EDGE_INSET, y: EDGE_INSET });
  const dragging = useRef(false);
  const dragMoved = useRef(false);
  const snapping = useRef(false);
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [promptSize, setPromptSize] = useState<Size>({ width: 0, height: 0 });
  const [pressed, setPressed] = useState(false);

  const setPosition = useCallback((next: Point) => {
    position.current = next;
    pan.setValue(next);
  }, [pan]);

  const animateToPosition = useCallback((next: Point, onComplete?: () => void) => {
    Animated.spring(pan, {
      toValue: next,
      tension: SNAP_TENSION,
      friction: SNAP_FRICTION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        position.current = next;
        onComplete?.();
      }
    });
  }, [pan]);

  useEffect(() => {
    const listenerId = pan.addListener(value => {
      if (typeof value.x === 'number' && typeof value.y === 'number') {
        position.current = value;
      }
    });
    return () => pan.removeListener(listenerId);
  }, [pan]);

  useEffect(() => {
    if (dragging.current || snapping.current || !canPlace(containerSize, promptSize)) return;
    setPosition(pointForCorner(corner, containerSize, promptSize, topBoundaryInset));
  }, [containerSize, corner, promptSize, setPosition, topBoundaryInset]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      dragging.current = true;
      dragMoved.current = false;
      snapping.current = false;
      dragStart.current = position.current;
      setPressed(true);
      pan.stopAnimation(value => {
        if (dragMoved.current) return;
        if (!value || typeof value.x !== 'number' || typeof value.y !== 'number') return;
        dragStart.current = value;
        setPosition(value);
      });
    },
    onPanResponderMove: (_event, gesture) => {
      if (!canPlace(containerSize, promptSize)) return;
      dragMoved.current = true;
      const { minX, minY, maxX, maxY } = getBounds(containerSize, promptSize, topBoundaryInset);
      setPosition({
        x: clamp(dragStart.current.x + gesture.dx, minX, maxX),
        y: clamp(dragStart.current.y + gesture.dy, minY, maxY),
      });
    },
    onPanResponderRelease: (_event, gesture) => {
      dragging.current = false;
      setPressed(false);
      if (!canPlace(containerSize, promptSize)) {
        onPress();
        return;
      }

      const movement = Math.hypot(gesture.dx, gesture.dy);
      if (movement <= TAP_MOVEMENT_THRESHOLD) {
        animateToPosition(pointForCorner(corner, containerSize, promptSize, topBoundaryInset));
        onPress();
        return;
      }

      const nextCorner = nearestCorner(position.current, containerSize, promptSize);
      snapping.current = true;
      onCornerChange(nextCorner);
      animateToPosition(pointForCorner(nextCorner, containerSize, promptSize, topBoundaryInset), () => {
        snapping.current = false;
      });
    },
    onPanResponderTerminate: () => {
      dragging.current = false;
      snapping.current = false;
      setPressed(false);
      if (canPlace(containerSize, promptSize)) {
        animateToPosition(pointForCorner(corner, containerSize, promptSize, topBoundaryInset));
      }
    },
  }), [animateToPosition, containerSize, corner, onCornerChange, onPress, pan, promptSize, setPosition, topBoundaryInset]);

  const onContainerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const onPromptLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPromptSize({ width, height });
  };

  return (
    <View pointerEvents={visible ? 'box-none' : 'none'} style={StyleSheet.absoluteFill} onLayout={onContainerLayout}>
      <Animated.View
        {...panResponder.panHandlers}
        onLayout={onPromptLayout}
        style={[
          styles.container,
          !visible && styles.hidden,
          pressed && styles.pressed,
          { transform: pan.getTranslateTransform() },
        ]}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>💬</Text>
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>Have more questions?</Text>
          <Text style={styles.subtitle}>Ask the assistant →</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#FFFFFF',

    paddingVertical: 12,
    paddingHorizontal: 14,

    borderRadius: 16,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.18,
    shadowRadius: 6,

    elevation: 20,

    zIndex: 999,
  },

  pressed: {
    opacity: 0.8,
  },

  hidden: {
    opacity: 0,
  },

  iconContainer: {
    marginRight: 10,
  },

  icon: {
    fontSize: 20,
  },

  textContainer: {
    flexDirection: 'column',
  },

  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },

  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
});
