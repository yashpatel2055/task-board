import NetInfo from '@react-native-community/netinfo';
import { mergeConfirmedPatch, recordTombstone, reconcileServerBoard } from '../engine/patch';
import { useBoardStore } from '../store/useBoardStore';
import { useNetworkStore } from '../store/useNetworkStore';
import { useQueueStore } from '../store/useQueueStore';
import { useToastStore } from '../store/useToastStore';
import { QueueAction, BoardPatch, BoardState } from '../types';
import { generateId } from '../utils/id';
import { getSocket, onBoardInit, onRemoteUpdate, sendAction } from './socket';
import { BuiltAction } from '../engine/actions';

let inFlight: Promise<void> | null = null;
let started = false;

const MAX_SEND_RETRIES = 8;

const tombstones = new Map<string, number>();

function whenStoresHydrated(cb: () => void): void {
  let boardReady = useBoardStore.persist.hasHydrated();
  let queueReady = useQueueStore.persist.hasHydrated();
  const runIfReady = () => {
    if (boardReady && queueReady) cb();
  };
  if (!boardReady) {
    useBoardStore.persist.onFinishHydration(() => {
      boardReady = true;
      runIfReady();
    });
  }
  if (!queueReady) {
    useQueueStore.persist.onFinishHydration(() => {
      queueReady = true;
      runIfReady();
    });
  }
  runIfReady();
}

export function __resetQueueProcessorForTests(): void {
  inFlight = null;
  started = false;
  tombstones.clear();
}

export function applyOptimistic(patch: BoardPatch) {
  useBoardStore.getState().apply(patch);
}

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

export function dispatchAction(built: BuiltAction): QueueAction {
  applyOptimistic(built.forwardPatch);
  return enqueueAction(built);
}

export function processQueue(): Promise<void> {
  if (inFlight) {
    return inFlight.then(() => processQueue());
  }
  const p = drainQueue().finally(() => {
    if (inFlight === p) inFlight = null;
  });
  inFlight = p;
  return p;
}

function backOffOrGiveUp(action: QueueAction): void {
  const attempts = action.retries + 1;
  if (attempts >= MAX_SEND_RETRIES) {
    useQueueStore
      .getState()
      .setStatus(action.localId, 'failed', 'Could not reach the server after several tries.');
    useToastStore.getState().show({
      message: "Some changes couldn't sync. They'll retry next time the app opens.",
      durationMs: 4000,
    });
  } else {
    useQueueStore.getState().setStatus(action.localId, 'pending');
    useQueueStore.getState().incrementRetries(action.localId);
  }
}

async function drainQueue(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { isOnline, isSocketConnected } = useNetworkStore.getState();
    if (!isOnline || !isSocketConnected) return;

    const next = useQueueStore.getState().queue.find(a => a.status === 'pending');
    if (!next) return;

    try {
      useQueueStore.getState().setStatus(next.localId, 'sending');
      const result = await sendAction(next);

      if (result.ok) {
        recordTombstone(tombstones, result.patch, {
          columns: useBoardStore.getState().columns,
          cards: useBoardStore.getState().cards,
        });
        useBoardStore.getState().apply(result.patch);
        useQueueStore.getState().removeAction(next.localId);
      } else if (result.error === 'TIMEOUT') {
        backOffOrGiveUp(next);
        return;
      } else {
        useBoardStore.getState().apply(next.inversePatch);
        useQueueStore.getState().removeAction(next.localId);
        useToastStore.getState().show({
          message: result.error || 'The server rejected that change.',
          durationMs: 4000,
        });
      }
    } catch {
      backOffOrGiveUp(next);
      return;
    }
  }
}

export function startSyncEngine(): () => void {
  if (started) return () => {};
  started = true;

  getSocket();

  const unsubNetInfo = NetInfo.addEventListener(state => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    useNetworkStore.getState().setOnline(online);
    if (online) void processQueue();
  });

  const applyServerBoard = (board: BoardState) => {
    const local = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    const queue = useQueueStore.getState().queue;
    const next = reconcileServerBoard(local, board, queue, tombstones);
    useBoardStore.setState({ columns: next.columns, cards: next.cards });
  };

  const unsubInit = onBoardInit(board => {
    whenStoresHydrated(() => applyServerBoard(board));
  });

  const unsubRemote = onRemoteUpdate(patch => {
    const state = { columns: useBoardStore.getState().columns, cards: useBoardStore.getState().cards };
    const queue = useQueueStore.getState().queue;
    recordTombstone(tombstones, patch, state);
    const next = mergeConfirmedPatch(state, patch, queue, tombstones);
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
