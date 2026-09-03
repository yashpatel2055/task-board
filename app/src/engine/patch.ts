import { BoardPatch, BoardState, Card, QueueAction } from '../types';

export function applyPatch(state: BoardState, patch: BoardPatch): BoardState {
  switch (patch.kind) {
    case 'upsertCard': {
      const idx = state.cards.findIndex(c => c.id === patch.card.id);
      const cards =
        idx === -1
          ? [...state.cards, patch.card]
          : state.cards.map((c, i) => (i === idx ? patch.card : c));
      return { ...state, cards };
    }
    case 'removeCard': {
      const cards = state.cards.filter(c => c.id !== patch.cardId);
      return cards.length === state.cards.length ? state : { ...state, cards };
    }
    case 'noop':
    default:
      return state;
  }
}

export function applyPatches(state: BoardState, patches: BoardPatch[]): BoardState {
  return patches.reduce(applyPatch, state);
}

export function queueHasPendingActionForCard(queue: QueueAction[], cardId: string): boolean {
  return queue.some(action => {
    switch (action.type) {
      case 'CREATE_CARD':
        return (action.payload as { card: Card }).card.id === cardId;
      case 'UPDATE_CARD':
      case 'DELETE_CARD':
      case 'MOVE_CARD':
        return (action.payload as { cardId: string }).cardId === cardId;
      default:
        return false;
    }
  });
}

export function mergeConfirmedPatch(
  state: BoardState,
  patch: BoardPatch,
  queue: QueueAction[],
  tombstones?: ReadonlyMap<string, number>,
): BoardState {
  if (patch.kind === 'upsertCard') {
    if (queueHasPendingActionForCard(queue, patch.card.id)) {
      return state;
    }
    const tombstoneVersion = tombstones?.get(patch.card.id);
    if (tombstoneVersion !== undefined && patch.card.version <= tombstoneVersion) {
      return state;
    }
    const existing = state.cards.find(c => c.id === patch.card.id);
    if (existing && existing.version >= patch.card.version) {
      return state;
    }
    return applyPatch(state, patch);
  }

  if (patch.kind === 'removeCard') {
    if (queueHasPendingActionForCard(queue, patch.cardId)) {
      return state;
    }
    return applyPatch(state, patch);
  }

  return state;
}

export function recordTombstone(
  tombstones: Map<string, number>,
  patch: BoardPatch,
  prevState: BoardState,
): void {
  if (patch.kind !== 'removeCard') return;
  const fallback = prevState.cards.find(c => c.id === patch.cardId)?.version ?? 0;
  tombstones.set(patch.cardId, patch.version ?? fallback);
}

export function reconcileServerBoard(
  local: BoardState,
  server: BoardState,
  queue: QueueAction[],
  tombstones?: ReadonlyMap<string, number>,
): BoardState {
  const cardsById = new Map(local.cards.map(c => [c.id, c]));

  for (const serverCard of server.cards) {
    if (queueHasPendingActionForCard(queue, serverCard.id)) continue;
    const tombstoneVersion = tombstones?.get(serverCard.id);
    if (tombstoneVersion !== undefined && serverCard.version <= tombstoneVersion) {
      cardsById.delete(serverCard.id);
      continue;
    }
    const localCard = cardsById.get(serverCard.id);
    if (!localCard || serverCard.version > localCard.version) {
      cardsById.set(serverCard.id, serverCard);
    }
  }

  const serverIds = new Set(server.cards.map(c => c.id));
  for (const localCard of local.cards) {
    if (!serverIds.has(localCard.id) && !queueHasPendingActionForCard(queue, localCard.id)) {
      cardsById.delete(localCard.id);
    }
  }

  return { columns: server.columns, cards: [...cardsById.values()] };
}
