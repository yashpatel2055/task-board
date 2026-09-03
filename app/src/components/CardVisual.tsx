import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../types';

interface Props {
  card: Card;
  isPending?: boolean;
  dragging?: boolean;
  onPress?: () => void;
  onDelete?: () => void;
}

export function CardVisual({ card, isPending, dragging, onPress, onDelete }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, dragging && styles.cardDragging]}
      accessibilityRole="button"
      accessibilityLabel={`Card: ${card.title}`}
    >
      {card.imageUri ? (
        <Image source={{ uri: card.imageUri }} style={styles.thumbnail} resizeMode="cover" />
      ) : null}

      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>
        {onDelete ? (
          <Pressable hitSlop={10} onPress={onDelete} accessibilityLabel="Delete card">
            <Text style={styles.deleteX}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {card.description ? (
        <Text style={styles.description} numberOfLines={3}>
          {card.description}
        </Text>
      ) : null}

      <View style={styles.footerRow}>
        {card.assignee ? (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{card.assignee.slice(0, 2).toUpperCase()}</Text>
          </View>
        ) : (
          <View />
        )}
        {isPending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Pending sync</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    width: 260,
  },
  cardDragging: {
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.03 }, { rotate: '2deg' }],
  },
  thumbnail: {
    width: '100%',
    height: 110,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#e5e7eb',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
  },
  deleteX: {
    fontSize: 20,
    color: '#9ca3af',
    lineHeight: 20,
  },
  description: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
  },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#c7d2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3730a3',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400e',
  },
});
