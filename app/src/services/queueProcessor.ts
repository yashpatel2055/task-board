import NetInfo from '@react-native-community/netinfo';
import { mergeConfirmedPatch } from '../engine/patch';
import { useBoardStore } from '../store/useBoardStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useQueueStore } from '../store/useQueueStore';
import { useToastStore } from '../store/useToastStore';
import { QueueAction, BoardPatch } from '../types';
import { generateId } from '../utils/id';
import { getSocket, onBoardInit, onRemoteUpdate, sendAction } from './socket';
import { BuiltAction } from '../engine/actions';

let inFlight: Promise<void> | null = null;
let started = false;

/**
 * Test-only escape hatch: the module-level `inFlight`/`started` state is
 * intentional (it makes the processor a safe-to-call-from-anywhere
 * singleton in the app), but that same module-level state would otherwise
 * leak between unrelated test cases in the same file. Tests call this in
 * `beforeEach` instead of reaching for `jest.resetModules()` every time.
 */
export function __resetQueueProcessorForTests(): void {
  inFlight = null;
  started = false;
}

/**
 * Apply a patch to the board store immediately -- this is "optimistic UI"
 * in one line: no network involved, no queue involved, just render the new
 * state right now.
 */
export function applyOptimistic(patch: BoardPatch) {
  useBoardStore.getState().apply(patch);
}

/**
 * Push a built action onto the persisted offline queue and kick the
 * processor. Does NOT touch board state -- call `applyOptimistic` first
 * (or rely on `dispatchAction` below, which does both).
 */
export function enqueueAction(built: BuiltAction): QueueAction {
  const action: QueueAction = {
    localId: generateId('act'),
    type: built.type,
    payload: built.payload,
    forwardPatch: built.forwardPatch,
    inversePatch: built.inversePatch,
    createdAt: Date.now(),
    status: 'pending',
    retries: 0,
  };
  useQueueStore.getState().enqueue(action);
  void processQueue();
  return action;
}

/** Optimistic apply + enqueue, for the common case (create/update/move). */
export function dispatchAction(built: BuiltAction): QueueAction {
  applyOptimistic(built.forwardPatch);
  return enqueueAction(built);
}

/**
 * Drains the offline queue strictly in FIFO order, one action at a time.
 * Safe to call as often as you like (network change, reconnect, enqueue,
 * periodic timer) -- redundant calls while a drain is already running just
 * attach to that same in-flight drain rather than starting a second one or
 * silently no-op-ing, so every caller's `await processQueue()` reliably
 * resolves only once the queue has actually been drained.
 */
export function processQueue(): Promise<void> {
  if (inFlight) {
    // A drain is already running. Don't start a second one -- but don't
    // just drop this call either (conditions may have changed, e.g. we
    // just came back online, or a new action was enqueued, after the
    // current drain had already decided there was nothing to do): chain
    // onto it and re-check once it finishes.
    return inFlight.then(() => processQueue());
  }
  const p = drainQueue().finally(() => {
    if (inFlight === p) inFlight = null;
  });
  inFlight = p;
  return p;
}

async function drainQueue(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { isOnline, isSocketConnected } = useNetworkStore.getState();
    if (!isOnline || !isSocketConnected) return;

    const next = useQueueStore.getState().queue.find(a => a.status !== 'sending');
    if (!next) return;

    try {
      useQueueStore.getState().setStatus(next.localId, 'sending');
      const result = await sendAction(next);

      if (result.ok) {
        // Server-confirmed truth replaces our optimistic guess (picks up
        // the real `updatedAt`/`version`, and for creates, confirms the id
        // we chose client-side is now canonical).
        useBoardStore.getState().apply(result.patch);
        useQueueStore.getState().removeAction(next.localId);
      } else if (result.error === 'TIMEOUT') {
        // Unknown outcome -- leave it queued and pending, don't roll back.
        useQueueStore.getState().setStatus(next.localId, 'pending');
        useQueueStore.getState().incrementRetries(next.localId);
        return; // avoid a tight retry loop; the periodic timer will pick it back up
      } else {
        // Real rejection: roll back the optimistic change and tell the user.
        useBoardStore.getState().apply(next.inversePatch);
        useQueueStore.getState().removeAction(next.localId);
        useToastStore.getState().show({
          message: result.error || 'The server rejected that change.',
          durationMs: 4000,
        });
      }
    } catch {
      // Unexpected local error sending -- treat like a timeout, retry later.
      useQueueStore.getState().setStatus(next.localId, 'pending');
      return;
    }
  }
}

/**
 * Wire everything up once, near app startup:
 *  - NetInfo reachability -> useNetworkStore.isOnline
 *  - socket connect/disconnect -> useNetworkStore.isSocketConnected (handled in socket.ts)
 *  - board:init -> seed the board store on first connect
 *  - board:remote-update -> merge other sessions' confirmed changes
 *  - queue length going up, or coming back online -> drain the queue
 *  - a slow periodic safety-net retry, in case a trigger was missed
 */
export function startSyncEngine(): () => void {
  if (started) return () => {};
  started = true;

  getSocket(); // establish the connection

  const unsubNetInfo = NetInfo.addEventListener(state => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    useNetworkStore.getState().setOnline(online);
    if (online) void processQueue();
  });

  const unsubInit = onBoardInit(board => {
    // Only seed from the server if we don't already have a board (fresh
    // install / first launch). If we already have local state -- including
    // possibly-unsynced offline edits -- we don't want to stomp it; the
    // queue will reconcile any pending actions on its own.
    const current = useBoardStore.getState();
    if (current.columns.length === 0 && current.cards.length === 0) {
      useBoardStore.getState().setBoard(board);
    }
  });

  const unsubRemote = onRemoteUpdate(patch => {
    const state = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    const queue = useQueueStore.getState().queue;
    const next = mergeConfirmedPatch(state, patch, queue);
    useBoardStore.setState({ columns: next.columns, cards: next.cards });
  });

  const unsubSocketConnect = useNetworkStore.subscribe((s, prev) => {
    if (s.isSocketConnected && !prev.isSocketConnected) void processQueue();
  });

  const unsubQueue = useQueueStore.subscribe((s, prev) => {
    if (s.queue.length > prev.queue.length) void processQueue();
  });

  const interval = setInterval(() => void processQueue(), 5000);

  return () => {
    unsubNetInfo();
    unsubInit();
    unsubRemote();
    unsubSocketConnect();
    unsubQueue();
    clearInterval(interval);
    started = false;
  };
}
