import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { CardVisual } from '../CardVisual';
import { useDragContext } from './DragProvider';

/**
 * Renders once, near the root of the screen (outside every ScrollView), so
 * it can float above column boundaries. While a drag is active it shows a
 * copy of the card at (translateX, translateY) -- both reanimated shared
 * values updated on the UI thread every frame in DraggableCard's `onUpdate`,
 * so this tracks the finger at full frame rate with no JS-thread round trip.
 */
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
