import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { Card } from '../../types';
import { CardVisual } from '../CardVisual';
import { useDragContext } from './DragProvider';

interface Props {
  card: Card;
  isPending: boolean;
  onPress: () => void;
  onDelete: () => void;
}

/**
 * The card as it sits in a column: a real gesture-handler Pan gesture that
 * only "activates" after a short hold (`activateAfterLongPress`), so a
 * quick vertical flick still scrolls the column normally and a deliberate
 * press-and-drag picks the card up. The visible drag animation itself is
 * rendered elsewhere (DragLayer, driven by reanimated shared values on the
 * UI thread) -- this component just fades out while it's the one being
 * dragged, and reports gesture begin/end to DragProvider.
 */
// Rough offset from the finger to the overlay's top-left corner, so the
// floating copy feels "grabbed" near where you pressed rather than snapping
// its center under your finger.
const GRAB_OFFSET_X = 40;
const GRAB_OFFSET_Y = 24;

export function DraggableCard({ card, isPending, onPress, onDelete }: Props) {
  const viewRef = useRef<View>(null);
  const {
    registerCardRef,
    unregisterCardRef,
    beginDrag,
    endDrag,
    cancelDrag,
    draggingCardId,
    translateX,
    translateY,
  } = useDragContext();

  useEffect(() => {
    registerCardRef(card.id, card.columnId, card.order, viewRef);
    return () => unregisterCardRef(card.id);
  }, [card.id, card.columnId, card.order, registerCardRef, unregisterCardRef]);

  const handleBegin = () => {
    viewRef.current?.measure((_x, _y, _w, _h, pageX, pageY) => {
      beginDrag(card, pageX, pageY);
    });
  };

  const handleEnd = (absoluteX: number, absoluteY: number) => {
    endDrag(absoluteX, absoluteY);
  };

  const handleFinalize = () => {
    // Safety net: if the gesture was cancelled/interrupted before onEnd
    // fired (e.g. the OS stole the gesture), make sure we don't leave the
    // card stuck faded out forever.
    cancelDrag();
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onBegin(event => {
      // Position the floating overlay immediately (UI thread, no
      // runOnJS hop) so there's no visible jump before the first onUpdate.
      translateX.value = event.absoluteX - GRAB_OFFSET_X;
      translateY.value = event.absoluteY - GRAB_OFFSET_Y;
      runOnJS(handleBegin)();
    })
    .onUpdate(event => {
      translateX.value = event.absoluteX - GRAB_OFFSET_X;
      translateY.value = event.absoluteY - GRAB_OFFSET_Y;
    })
    .onEnd(event => {
      runOnJS(handleEnd)(event.absoluteX, event.absoluteY);
    })
    .onFinalize(() => {
      runOnJS(handleFinalize)();
    });

  const isBeingDragged = draggingCardId === card.id;

  return (
    <GestureDetector gesture={pan}>
      <View ref={viewRef} style={{ opacity: isBeingDragged ? 0.25 : 1 }} collapsable={false}>
        <CardVisual card={card} isPending={isPending} onPress={onPress} onDelete={onDelete} />
      </View>
    </GestureDetector>
  );
}
