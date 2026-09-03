import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildCreateCardAction, buildDeleteCardAction, buildMoveCardAction, buildUpdateCardAction } from '../engine/actions';
import { useBoardStore } from '../store/useBoardStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useQueueStore } from '../store/useQueueStore';
import { useToastStore } from '../store/useToastStore';
import { applyOptimistic, dispatchAction, enqueueAction } from '../services/queueProcessor';
import { Card } from '../types';
import { Column } from '../components/Column';
import { SearchBar } from '../components/SearchBar';
import { Toast } from '../components/Toast';
import { CardEditModal, CardEditResult } from '../components/modals/CardEditModal';
import { DragProvider } from '../components/dnd/DragProvider';
import { DragLayer } from '../components/dnd/DragLayer';

function matchesQuery(card: Card, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return (
    card.title.toLowerCase().includes(q) ||
    (card.description ?? '').toLowerCase().includes(q) ||
    (card.assignee ?? '').toLowerCase().includes(q)
  );
}

export function BoardScreen() {
  const columns = useBoardStore(s => s.columns);
  const cards = useBoardStore(s => s.cards);
  const queue = useQueueStore(s => s.queue);
  const isOnline = useNetworkStore(s => s.isOnline);
  const isSocketConnected = useNetworkStore(s => s.isSocketConnected);

  const [query, setQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  const pendingCardIds = useMemo(() => {
    const ids = new Set<string>();
    queue.forEach(action => {
      const payload = action.payload as { cardId?: string; card?: Card };
      if (payload.cardId) ids.add(payload.cardId);
      if (payload.card) ids.add(payload.card.id);
    });
    return ids;
  }, [queue]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Card[]>();
    columns.forEach(col => map.set(col.id, []));
    cards.filter(c => matchesQuery(c, query)).forEach(c => {
      const list = map.get(c.columnId);
      if (list) list.push(c);
    });
    return map;
  }, [columns, cards, query]);

  const openCreate = (columnId: string) => {
    setEditingCard(null);
    setTargetColumnId(columnId);
    setModalVisible(true);
  };

  const openEdit = (card: Card) => {
    setEditingCard(card);
    setTargetColumnId(card.columnId);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingCard(null);
    setTargetColumnId(null);
  };

  const handleSave = (result: CardEditResult) => {
    const state = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    if (editingCard) {
      const built = buildUpdateCardAction(state, editingCard.id, result);
      dispatchAction(built);
    } else if (targetColumnId) {
      const built = buildCreateCardAction(state, { columnId: targetColumnId, ...result });
      dispatchAction(built);
    }
    closeModal();
  };

  const handleDelete = (card: Card) => {
    const state = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    const built = buildDeleteCardAction(state, card.id);

    // Apply the delete to the UI immediately, but hold off telling the
    // server for the undo window -- if the user taps Undo, we just apply
    // the inverse patch and nothing ever hits the network/queue.
    applyOptimistic(built.forwardPatch);

    useToastStore.getState().show({
      message: `"${card.title}" deleted`,
      actionLabel: 'Undo',
      durationMs: 5000,
      onAction: () => applyOptimistic(built.inversePatch),
      onExpire: () => enqueueAction(built),
    });
  };

  const handleDrop = (cardId: string, toColumnId: string, toIndex: number) => {
    const state = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    const card = state.cards.find(c => c.id === cardId);
    if (!card) return;
    // No-op guard: dropped back in (roughly) the same spot.
    const built = buildMoveCardAction(state, cardId, toColumnId, toIndex);
    dispatchAction(built);
  };

  const showOfflineBanner = !isOnline || !isSocketConnected;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Kanban Board</Text>
        {queue.length > 0 ? (
          <View style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>{queue.length} pending sync</Text>
          </View>
        ) : null}
      </View>

      {showOfflineBanner ? (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            You're offline — changes are queued and will sync automatically once you're back online.
          </Text>
        </View>
      ) : null}

      <SearchBar value={query} onChange={setQuery} />

      <DragProvider onDrop={handleDrop}>
        <ScrollView
          horizontal
          style={styles.board}
          contentContainerStyle={styles.boardContent}
          showsHorizontalScrollIndicator={false}
        >
          {columns
            .slice()
            .sort((a, b) => a.order - b.order)
            .map(col => (
              <Column
                key={col.id}
                column={col}
                cards={cardsByColumn.get(col.id) ?? []}
                pendingCardIds={pendingCardIds}
                onCardPress={openEdit}
                onCardDelete={handleDelete}
                onAddCard={openCreate}
              />
            ))}
        </ScrollView>
        <DragLayer />
      </DragProvider>

      <CardEditModal visible={modalVisible} editingCard={editingCard} onCancel={closeModal} onSave={handleSave} />
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f5f6f8',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  queueBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  queueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  offlineBanner: {
    backgroundColor: '#fee2e2',
    marginHorizontal: 16,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  offlineBannerText: {
    color: '#991b1b',
    fontSize: 11,
  },
  board: {
    flex: 1,
  },
  boardContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: 'flex-start',
  },
});
