import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { CardVisual } from '../CardVisual';
import { useDragContext } from './DragProvider';

export function DragLayer() {
  const { draggingCard, translateX, translateY } = useDragContext();

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  if (!draggingCard) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, style]}>
      <CardVisual card={draggingCard} dragging />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 999,
  },
});
