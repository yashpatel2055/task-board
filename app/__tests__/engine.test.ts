import {
  applyPatch,
  mergeConfirmedPatch,
  queueHasPendingActionForCard,
  recordTombstone,
  reconcileServerBoard,
} from '../src/engine/patch';
import {
  buildCreateCardAction,
  buildDeleteCardAction,
  buildMoveCardAction,
  buildUpdateCardAction,
  computeOrderForIndex,
} from '../src/engine/actions';
import { BoardState, Card, QueueAction } from '../src/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    columnId: 'col-a',
    title: 'Original title',
    order: 0,
    updatedAt: 1000,
    version: 1,
    ...overrides,
  };
}

function makeState(cards: Card[] = [makeCard()]): BoardState {
  return {
    columns: [
      { id: 'col-a', title: 'To Do', order: 0 },
      { id: 'col-b', title: 'In Progress', order: 1 },
    ],
    cards,
  };
}

describe('applyPatch', () => {
  it('upserts a new card', () => {
    const state = makeState([]);
    const card = makeCard();
    const next = applyPatch(state, { kind: 'upsertCard', card });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]).toEqual(card);
  });

  it('replaces an existing card with the same id', () => {
    const state = makeState();
    const updated = makeCard({ title: 'Changed' });
    const next = applyPatch(state, { kind: 'upsertCard', card: updated });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0].title).toBe('Changed');
  });

  it('removes a card by id', () => {
    const state = makeState();
    const next = applyPatch(state, { kind: 'removeCard', cardId: 'card-1' });
    expect(next.cards).toHaveLength(0);
  });

  it('removeCard is a safe no-op when the card is already gone', () => {
    const state = makeState([]);
    const next = applyPatch(state, { kind: 'removeCard', cardId: 'does-not-exist' });
    expect(next).toBe(state);
  });

  it('a noop patch never changes state', () => {
    const state = makeState();
    const next = applyPatch(state, { kind: 'noop' });
    expect(next).toBe(state);
  });
});

describe('action builders produce correct forward + inverse patches', () => {
  it('create: forward adds the card, inverse removes it', () => {
    const state = makeState([]);
    const built = buildCreateCardAction(state, { columnId: 'col-a', title: 'New card' });

    const afterForward = applyPatch(state, built.forwardPatch);
    expect(afterForward.cards).toHaveLength(1);
    expect(afterForward.cards[0].title).toBe('New card');

    const afterInverse = applyPatch(afterForward, built.inversePatch);
    expect(afterInverse.cards).toHaveLength(0);
  });

  it('update: forward applies the change, inverse restores the exact previous card', () => {
    const original = makeCard({ title: 'Before', description: 'desc' });
    const state = makeState([original]);
    const built = buildUpdateCardAction(state, 'card-1', { title: 'After' });

    const afterForward = applyPatch(state, built.forwardPatch);
    expect(afterForward.cards[0].title).toBe('After');
    expect(afterForward.cards[0].description).toBe('desc');

    const afterInverse = applyPatch(afterForward, built.inversePatch);
    expect(afterInverse.cards[0]).toEqual(original);
  });

  it('delete: forward removes the card, inverse fully restores it', () => {
    const original = makeCard();
    const state = makeState([original]);
    const built = buildDeleteCardAction(state, 'card-1');

    const afterForward = applyPatch(state, built.forwardPatch);
    expect(afterForward.cards).toHaveLength(0);

    const afterInverse = applyPatch(afterForward, built.inversePatch);
    expect(afterInverse.cards).toHaveLength(1);
    expect(afterInverse.cards[0]).toEqual(original);
  });

  it('move: forward changes columnId + order, inverse restores the original column/position', () => {
    const original = makeCard({ columnId: 'col-a', order: 0 });
    const state = makeState([original]);
    const built = buildMoveCardAction(state, 'card-1', 'col-b', 0);

    const afterForward = applyPatch(state, built.forwardPatch);
    expect(afterForward.cards[0].columnId).toBe('col-b');

    const afterInverse = applyPatch(afterForward, built.inversePatch);
    expect(afterInverse.cards[0].columnId).toBe('col-a');
    expect(afterInverse.cards[0].order).toBe(0);
  });

  it('update/delete throw on an unknown card id rather than silently no-op-ing', () => {
    const state = makeState([]);
    expect(() => buildUpdateCardAction(state, 'missing', { title: 'x' })).toThrow();
    expect(() => buildDeleteCardAction(state, 'missing')).toThrow();
  });
});

describe('computeOrderForIndex (fractional ordering for drag-and-drop)', () => {
  const cards = [makeCard({ id: 'a', order: 0 }), makeCard({ id: 'b', order: 1 }), makeCard({ id: 'c', order: 2 })];

  it('drops before the first card', () => {
    expect(computeOrderForIndex(cards, 0)).toBeLessThan(0);
  });

  it('drops between two cards', () => {
    const order = computeOrderForIndex(cards, 1);
    expect(order).toBeGreaterThan(0);
    expect(order).toBeLessThan(1);
  });

  it('drops after the last card', () => {
    expect(computeOrderForIndex(cards, cards.length)).toBeGreaterThan(2);
  });

  it('handles an empty column', () => {
    expect(computeOrderForIndex([], 0)).toBe(0);
  });
});

describe('mergeConfirmedPatch (remote update conflict handling)', () => {
  it('applies a confirmed remote patch when nothing local is pending for that card', () => {
    const state = makeState([makeCard({ version: 1 })]);
    const remotePatch = { kind: 'upsertCard' as const, card: makeCard({ title: 'From another session', version: 2 }) };

    const next = mergeConfirmedPatch(state, remotePatch, []);
    expect(next.cards[0].title).toBe('From another session');
  });

  it('does NOT let a remote update clobber a card with an in-flight local action', () => {
    const state = makeState([makeCard({ title: 'My local edit', version: 1 })]);
    const pendingQueue: QueueAction[] = [
      {
        localId: 'act-1',
        type: 'UPDATE_CARD',
        payload: { cardId: 'card-1', changes: { title: 'My local edit' } },
        forwardPatch: { kind: 'noop' },
        inversePatch: { kind: 'noop' },
        createdAt: Date.now(),
        status: 'pending',
        retries: 0,
      },
    ];
    const remotePatch = {
      kind: 'upsertCard' as const,
      card: makeCard({ title: 'Someone else changed it first', version: 2 }),
    };

    const next = mergeConfirmedPatch(state, remotePatch, pendingQueue);
    expect(next.cards[0].title).toBe('My local edit');
  });

  it('ignores a stale/out-of-order remote patch (version not newer than what we have)', () => {
    const state = makeState([makeCard({ title: 'Current', version: 5 })]);
    const stalePatch = { kind: 'upsertCard' as const, card: makeCard({ title: 'Stale', version: 3 }) };

    const next = mergeConfirmedPatch(state, stalePatch, []);
    expect(next.cards[0].title).toBe('Current');
  });

  it('ignores a stale upsert for a card that was already deleted (tombstone guard)', () => {
    let state = makeState([makeCard({ version: 5 })]);
    const tombstones = new Map<string, number>();
    const deletePatch = { kind: 'removeCard' as const, cardId: 'card-1', version: 6 };

    recordTombstone(tombstones, deletePatch, state);
    state = mergeConfirmedPatch(state, deletePatch, [], tombstones);
    expect(state.cards).toHaveLength(0);

    const stale = { kind: 'upsertCard' as const, card: makeCard({ title: 'Zombie', version: 4 }) };
    state = mergeConfirmedPatch(state, stale, [], tombstones);
    expect(state.cards).toHaveLength(0);

    const recreate = { kind: 'upsertCard' as const, card: makeCard({ title: 'Reborn', version: 9 }) };
    state = mergeConfirmedPatch(state, recreate, [], tombstones);
    expect(state.cards).toHaveLength(1);
    expect(state.cards[0].title).toBe('Reborn');
  });

  it('recordTombstone only reacts to removeCard patches', () => {
    const tombstones = new Map<string, number>();
    const state = makeState();
    recordTombstone(tombstones, { kind: 'upsertCard', card: makeCard() }, state);
    recordTombstone(tombstones, { kind: 'noop' }, state);
    expect(tombstones.size).toBe(0);

    recordTombstone(tombstones, { kind: 'removeCard', cardId: 'card-1' }, makeState([makeCard({ version: 7 })]));
    expect(tombstones.get('card-1')).toBe(7);
  });

  it('queueHasPendingActionForCard checks CREATE/UPDATE/DELETE/MOVE payload shapes', () => {
    const q: QueueAction[] = [
      {
        localId: 'act-1',
        type: 'CREATE_CARD',
        payload: { card: makeCard({ id: 'new-card' }) },
        forwardPatch: { kind: 'noop' },
        inversePatch: { kind: 'noop' },
        createdAt: Date.now(),
        status: 'pending',
        retries: 0,
      },
    ];
    expect(queueHasPendingActionForCard(q, 'new-card')).toBe(true);
    expect(queueHasPendingActionForCard(q, 'someone-else')).toBe(false);
  });
});

describe('reconcileServerBoard (merging a server snapshot into local state on reconnect)', () => {
  const cols = [
    { id: 'col-a', title: 'To Do', order: 0 },
    { id: 'col-b', title: 'In Progress', order: 1 },
  ];

  it('takes the server card when it is newer, and adds server cards we do not have', () => {
    const local: BoardState = { columns: cols, cards: [makeCard({ id: 'c1', title: 'Local v1', version: 1 })] };
    const server: BoardState = {
      columns: cols,
      cards: [
        makeCard({ id: 'c1', title: 'Server v3', version: 3 }),
        makeCard({ id: 'c2', title: 'Made elsewhere while we were away', version: 5 }),
      ],
    };

    const next = reconcileServerBoard(local, server, []);
    expect(next.cards.find(c => c.id === 'c1')!.title).toBe('Server v3');
    expect(next.cards.find(c => c.id === 'c2')!.title).toBe('Made elsewhere while we were away');
  });

  it('keeps a local optimistic edit that still has a pending queue action', () => {
    const local: BoardState = { columns: cols, cards: [makeCard({ id: 'c1', title: 'My offline edit', version: 1 })] };
    const server: BoardState = { columns: cols, cards: [makeCard({ id: 'c1', title: 'Server thinks this', version: 9 })] };
    const queue: QueueAction[] = [
      {
        localId: 'act-1',
        type: 'UPDATE_CARD',
        payload: { cardId: 'c1', changes: { title: 'My offline edit' } },
        forwardPatch: { kind: 'noop' },
        inversePatch: { kind: 'noop' },
        createdAt: Date.now(),
        status: 'pending',
        retries: 0,
      },
    ];

    const next = reconcileServerBoard(local, server, queue);
    expect(next.cards.find(c => c.id === 'c1')!.title).toBe('My offline edit');
  });

  it('keeps an offline-created card the server does not have yet (pending CREATE), but drops one with nothing pending', () => {
    const local: BoardState = {
      columns: cols,
      cards: [
        makeCard({ id: 'offline-new', title: 'Created offline', version: 0 }),
        makeCard({ id: 'stale-local', title: 'Deleted on another device', version: 2 }),
      ],
    };
    const server: BoardState = { columns: cols, cards: [] };
    const queue: QueueAction[] = [
      {
        localId: 'act-1',
        type: 'CREATE_CARD',
        payload: { card: makeCard({ id: 'offline-new' }) },
        forwardPatch: { kind: 'noop' },
        inversePatch: { kind: 'noop' },
        createdAt: Date.now(),
        status: 'pending',
        retries: 0,
      },
    ];

    const next = reconcileServerBoard(local, server, queue);
    expect(next.cards.map(c => c.id)).toEqual(['offline-new']);
  });

  it('does not resurrect a tombstoned card even if the snapshot still contains it', () => {
    const local: BoardState = { columns: cols, cards: [] };
    const server: BoardState = { columns: cols, cards: [makeCard({ id: 'gone', version: 4 })] };
    const tombstones = new Map<string, number>([['gone', 5]]);

    const next = reconcileServerBoard(local, server, [], tombstones);
    expect(next.cards).toHaveLength(0);
  });
});
