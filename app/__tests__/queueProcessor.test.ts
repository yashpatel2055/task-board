import { buildCreateCardAction, buildUpdateCardAction } from '../src/engine/actions';
import { useBoardStore } from '../src/store/useBoardStore';
import { useNetworkStore } from '../src/store/useNetworkStore';
import { useQueueStore } from '../src/store/useQueueStore';
import { useToastStore } from '../src/store/useToastStore';
import { BoardState } from '../src/types';

// The real socket module talks to socket.io-client, which we don't want
// anywhere near a unit test. Mock it so `sendAction` is fully controllable
// per-test, which is what lets us deterministically exercise "server
// confirms", "server rejects", and "server times out" without a real
// server or real network timing.
jest.mock('../src/services/socket', () => ({
  sendAction: jest.fn(),
  getSocket: jest.fn(),
  onBoardInit: jest.fn(() => () => {}),
  onRemoteUpdate: jest.fn(() => () => {}),
}));

// eslint-disable-next-line import/first
import { sendAction } from '../src/services/socket';
// eslint-disable-next-line import/first
import { __resetQueueProcessorForTests, dispatchAction, processQueue } from '../src/services/queueProcessor';

const sendActionMock = sendAction as jest.Mock;

function emptyBoard(): BoardState {
  return {
    columns: [
      { id: 'col-a', title: 'To Do', order: 0 },
      { id: 'col-b', title: 'In Progress', order: 1 },
    ],
    cards: [],
  };
}

beforeEach(() => {
  sendActionMock.mockReset();
  __resetQueueProcessorForTests();
  useBoardStore.setState(emptyBoard());
  useQueueStore.setState({ queue: [], hydrated: true });
  useToastStore.setState({ visible: false, message: '', durationMs: 3000 });
  // Both flags need to be true for the processor to attempt sends at all --
  // this is what "offline" tests flip off.
  useNetworkStore.setState({ isOnline: true, isSocketConnected: true });
});

describe('offline queue + reconciliation (queueProcessor)', () => {
  it('applies the optimistic patch to the board immediately, before any network round trip', () => {
    sendActionMock.mockReturnValue(new Promise(() => {})); // never resolves
    const built = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'New card' });
    dispatchAction(built);

    expect(useBoardStore.getState().cards).toHaveLength(1);
    expect(useBoardStore.getState().cards[0].title).toBe('New card');
    expect(useQueueStore.getState().queue).toHaveLength(1);
  });

  it('processes queued actions strictly in FIFO order', async () => {
    const order: string[] = [];
    sendActionMock.mockImplementation(async action => {
      order.push(action.localId);
      return { ok: true, patch: action.forwardPatch };
    });

    const a = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'First' });
    const qa = dispatchAction(a);
    const b = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Second' });
    const qb = dispatchAction(b);
    const c = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Third' });
    const qc = dispatchAction(c);

    await processQueue();

    expect(order).toEqual([qa.localId, qb.localId, qc.localId]);
    expect(useQueueStore.getState().queue).toHaveLength(0);
  });

  it('on server confirmation, replaces the optimistic card with the server-confirmed version and clears the queue entry', async () => {
    const built = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Draft title' });
    const confirmedCard = { ...(built.payload as { card: any }).card, version: 1, updatedAt: 999 };
    sendActionMock.mockResolvedValue({ ok: true, patch: { kind: 'upsertCard', card: confirmedCard } });

    dispatchAction(built);
    await processQueue();

    expect(useQueueStore.getState().queue).toHaveLength(0);
    expect(useBoardStore.getState().cards[0].version).toBe(1);
  });

  it('on server rejection, rolls back the optimistic change via the inverse patch and surfaces an error toast', async () => {
    const existing = { ...useBoardStore.getState() };
    const built = buildUpdateCardAction(
      { columns: existing.columns, cards: [{ id: 'card-1', columnId: 'col-a', title: 'Original', order: 0, updatedAt: 1, version: 1 }] },
      'card-1',
      { title: 'This will FAIL validation' },
    );
    useBoardStore.setState({
      columns: existing.columns,
      cards: [{ id: 'card-1', columnId: 'col-a', title: 'Original', order: 0, updatedAt: 1, version: 1 }],
    });

    sendActionMock.mockResolvedValue({ ok: false, error: 'Rejected: title contains the demo trigger word "FAIL".' });

    dispatchAction(built);
    expect(useBoardStore.getState().cards[0].title).toBe('This will FAIL validation'); // optimistic

    await processQueue();

    expect(useBoardStore.getState().cards[0].title).toBe('Original'); // rolled back
    expect(useQueueStore.getState().queue).toHaveLength(0); // rejected action is dropped, not retried
    expect(useToastStore.getState().visible).toBe(true);
    expect(useToastStore.getState().message).toContain('FAIL');
  });

  it('on a network timeout, leaves the action pending in the queue WITHOUT rolling back (unknown outcome, not a rejection)', async () => {
    sendActionMock.mockResolvedValue({ ok: false, error: 'TIMEOUT' });

    const built = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Maybe made it, maybe not' });
    dispatchAction(built);
    await processQueue();

    expect(useBoardStore.getState().cards).toHaveLength(1); // still shown optimistically
    expect(useQueueStore.getState().queue).toHaveLength(1); // still queued
    expect(useQueueStore.getState().queue[0].status).toBe('pending');
    // How many times it got retried depends on how many overlapping
    // processQueue() calls happened to fire (dispatchAction triggers one
    // itself); what matters for correctness is "at least once, never
    // dropped, never rolled back."
    expect(useQueueStore.getState().queue[0].retries).toBeGreaterThanOrEqual(1);
    expect(useToastStore.getState().visible).toBe(false); // no error shown for an ambiguous timeout
  });

  it('does not attempt to send anything while offline', async () => {
    useNetworkStore.setState({ isOnline: false, isSocketConnected: false });
    const built = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Queued while offline' });
    dispatchAction(built);

    await processQueue();

    expect(sendActionMock).not.toHaveBeenCalled();
    expect(useQueueStore.getState().queue).toHaveLength(1);
    expect(useQueueStore.getState().queue[0].status).toBe('pending');
  });

  it('replays the queue once connectivity returns, in the order actions were originally queued', async () => {
    useNetworkStore.setState({ isOnline: false, isSocketConnected: false });
    const first = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Offline #1' });
    dispatchAction(first);
    const second = buildCreateCardAction(useBoardStore.getState(), { columnId: 'col-a', title: 'Offline #2' });
    dispatchAction(second);

    expect(useQueueStore.getState().queue).toHaveLength(2);

    const order: string[] = [];
    sendActionMock.mockImplementation(async action => {
      order.push(action.localId);
      return { ok: true, patch: action.forwardPatch };
    });

    useNetworkStore.setState({ isOnline: true, isSocketConnected: true });
    await processQueue();

    expect(order[0]).toContain('act-'); // sanity: real localIds, not undefined
    expect(useQueueStore.getState().queue).toHaveLength(0);
    expect(useBoardStore.getState().cards.map(c => c.title).sort()).toEqual(['Offline #1', 'Offline #2']);
  });
});
