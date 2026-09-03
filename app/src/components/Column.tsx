import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Column as ColumnType } from '../types';
import { useDragContext } from './dnd/DragProvider';
import { DraggableCard } from './dnd/DraggableCard';

interface Props {
  column: ColumnType;
  cards: Card[];
  pendingCardIds: Set<string>;
  onCardPress: (card: Card) => void;
  onCardDelete: (card: Card) => void;
  onAddCard: (columnId: string) => void;
}

export const COLUMN_WIDTH = 288;

export function Column({ column, cards, pendingCardIds, onCardPress, onCardDelete, onAddCard }: Props) {
  const viewRef = useRef<View>(null);
  const { registerColumnRef, isDragging } = useDragContext();

  useEffect(() => {
    registerColumnRef(column.id, viewRef);
  }, [column.id, registerColumnRef]);

  const sorted = [...cards].sort((a, b) => a.order - b.order);

  return (
    <View ref={viewRef} style={styles.column} collapsable={false}>
      <View style={styles.header}>
        <Text style={styles.title}>{column.title}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{sorted.length}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        scrollEnabled={!isDragging}
        showsVerticalScrollIndicator={false}
      >
        {sorted.map(card => (
          <DraggableCard
            key={card.id}
            card={card}
            isPending={pendingCardIds.has(card.id)}
            onPress={() => onCardPress(card)}
            onDelete={() => onCardDelete(card)}
          />
        ))}
        {sorted.length === 0 ? <Text style={styles.emptyText}>No cards</Text> : null}
      </ScrollView>

      <Pressable style={styles.addButton} onPress={() => onAddCard(column.id)}>
        <Text style={styles.addButtonText}>+ Add card</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    width: COLUMN_WIDTH,
    marginRight: 12,
    backgroundColor: '#eef0f4',
    borderRadius: 12,
    maxHeight: '100%',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: '#dfe3ea',
    borderRadius: 999,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  list: {
    paddingHorizontal: 10,
  },
  listContent: {
    paddingBottom: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 12,
  },
  addButton: {
    marginHorizontal: 10,
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addButtonText: {
    textAlign: 'center',
    color: '#4b5563',
    fontWeight: '600',
    fontSize: 13,
  },
});
