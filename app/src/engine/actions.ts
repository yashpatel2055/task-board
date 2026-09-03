import { generateId } from '../utils/id';
import {
  ActionPayload,
  BoardPatch,
  BoardState,
  Card,
  CreateCardPayload,
  DeleteCardPayload,
  MoveCardPayload,
  QueueAction,
  UpdateCardPayload,
} from '../types';

export interface BuiltAction {
  type: QueueAction['type'];
  payload: ActionPayload;
  forwardPatch: BoardPatch;
  inversePatch: BoardPatch;
}

function findCardOrThrow(state: BoardState, cardId: string): Card {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not found`);
  return card;
}

/**
 * Fractional/"Trello-style" ordering: to drop a card at `targetIndex` within
 * `cardsInColumn` (already sorted by order, and NOT including the card being
 * moved), we only need a number between its new neighbours. This avoids
 * rewriting the order of every other card in the column on every drag.
 */
export function computeOrderForIndex(cardsInColumn: Card[], targetIndex: number): number {
  if (cardsInColumn.length === 0) return 0;
  if (targetIndex <= 0) return cardsInColumn[0].order - 1;
  if (targetIndex >= cardsInColumn.length) {
    return cardsInColumn[cardsInColumn.length - 1].order + 1;
  }
  const before = cardsInColumn[targetIndex - 1].order;
  const after = cardsInColumn[targetIndex].order;
  return (before + after) / 2;
}

export function buildCreateCardAction(
  state: BoardState,
  input: { columnId: string; title: string; description?: string; assignee?: string; imageUri?: string },
): BuiltAction {
  const cardsInColumn = state.cards
    .filter(c => c.columnId === input.columnId)
    .sort((a, b) => a.order - b.order);
  const order = cardsInColumn.length === 0 ? 0 : cardsInColumn[cardsInColumn.length - 1].order + 1;

  const card: Card = {
    id: generateId('card'),
    columnId: input.columnId,
    title: input.title,
    description: input.description,
    assignee: input.assignee,
    imageUri: input.imageUri,
    order,
    updatedAt: Date.now(),
    version: 0, // 0 = "not yet confirmed by the server"
  };

  const payload: CreateCardPayload = { card };

  return {
    type: 'CREATE_CARD',
    payload,
    forwardPatch: { kind: 'upsertCard', card },
    inversePatch: { kind: 'removeCard', cardId: card.id },
  };
}

export function buildUpdateCardAction(
  state: BoardState,
  cardId: string,
  changes: UpdateCardPayload['changes'],
): BuiltAction {
  const existing = findCardOrThrow(state, cardId);
  const updated: Card = { ...existing, ...changes, updatedAt: Date.now() };

  const payload: UpdateCardPayload = { cardId, changes };

  return {
    type: 'UPDATE_CARD',
    payload,
    forwardPatch: { kind: 'upsertCard', card: updated },
    // Restoring the exact previous card is safe: this patch only ever
    // touches this one card's row, so it can't stomp on other cards'
    // concurrent optimistic changes.
    inversePatch: { kind: 'upsertCard', card: existing },
  };
}

export function buildDeleteCardAction(state: BoardState, cardId: string): BuiltAction {
  const existing = findCardOrThrow(state, cardId);
  const payload: DeleteCardPayload = { cardId };

  return {
    type: 'DELETE_CARD',
    payload,
    forwardPatch: { kind: 'removeCard', cardId },
    inversePatch: { kind: 'upsertCard', card: existing },
  };
}

export function buildMoveCardAction(
  state: BoardState,
  cardId: string,
  toColumnId: string,
  targetIndex: number,
): BuiltAction {
  const existing = findCardOrThrow(state, cardId);
  const destinationCards = state.cards
    .filter(c => c.columnId === toColumnId && c.id !== cardId)
    .sort((a, b) => a.order - b.order);
  const order = computeOrderForIndex(destinationCards, targetIndex);

  const updated: Card = { ...existing, columnId: toColumnId, order, updatedAt: Date.now() };
  const payload: MoveCardPayload = { cardId, toColumnId, order };

  return {
    type: 'MOVE_CARD',
    payload,
    forwardPatch: { kind: 'upsertCard', card: updated },
    inversePatch: { kind: 'upsertCard', card: existing },
  };
}
