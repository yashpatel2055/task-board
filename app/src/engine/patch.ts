import { BoardPatch, BoardState, Card, QueueAction } from '../types';

/**
 * The single place board state is ever mutated. Everything else -- the
 * optimistic apply on user action, the rollback on server rejection, and
 * merging a confirmed change broadcast from another session -- funnels
 * through this one pure function. That's what makes the three "different"
 * flows actually be the same flow, and what makes them unit-testable
 * without a store or a socket in sight.
 */
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
      // No-op if the card was already gone (e.g. inverse of a create that
      // never made it to the server) -- return a fresh array only if it
      // actually changed, so callers can cheaply compare by reference.
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

/**
 * Does any action currently sitting in the offline/send queue touch this
 * card? Used to guard against a remote broadcast clobbering a local
 * optimistic edit that hasn't been confirmed (or rejected) yet -- the local
 * pending action wins until it resolves, at which point the queue processor
 * applies the server's confirmed patch anyway.
 */
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

/**
 * Merge a confirmed patch coming from the server -- either our own action's
 * ack, or a `board:remote-update` broadcast triggered by another session.
 *
 * Conflict rule (deliberately simple, and explained in the README):
 *   1. If we have a local action for this card still in flight, the local
 *      optimistic value wins for now; the queue will reconcile it once that
 *      action resolves.
 *   2. Otherwise, the server is authoritative. We additionally ignore a
 *      patch whose card `version` is not newer than what we already have,
 *      to stay safe against out-of-order delivery.
 */
export function mergeConfirmedPatch(
  state: BoardState,
  patch: BoardPatch,
  queue: QueueAction[],
): BoardState {
  if (patch.kind === 'upsertCard') {
    if (queueHasPendingActionForCard(queue, patch.card.id)) {
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
