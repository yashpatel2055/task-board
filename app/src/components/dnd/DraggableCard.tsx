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

const GRAB_OFFSET_X = 40;
const GRAB_OFFSET_Y = 24;

export function DraggableCard({ card, isPending, onPress, onDelete }: Props) {
  const viewRef = useRef<View>(null);
  const {
    registerCardRef,
    unregisterCardRef,
    prepareDrag,
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

  const handlePrepare = () => {
    prepareDrag(card.id);
  };

  const handleBegin = () => {
    beginDrag(card);
  };

  const handleEnd = (absoluteX: number, absoluteY: number) => {
    endDrag(absoluteX, absoluteY);
  };

  const handleFinalize = () => {
    cancelDrag();
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onBegin(event => {
      translateX.value = event.absoluteX - GRAB_OFFSET_X;
      translateY.value = event.absoluteY - GRAB_OFFSET_Y;
      runOnJS(handlePrepare)();
    })
    .onStart(() => {
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
