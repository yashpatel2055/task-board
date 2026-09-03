import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueueStore } from '../src/store/useQueueStore';
import { QueueAction } from '../src/types';

const STORAGE_KEY = 'kanban-offline-queue';

function sampleAction(localId: string): QueueAction {
  return {
    localId,
    type: 'CREATE_CARD',
    payload: {
      card: {
        id: 'card-x',
        columnId: 'col-a',
        title: 'Persisted card',
        order: 0,
        updatedAt: Date.now(),
        version: 0,
      },
    },
    forwardPatch: { kind: 'noop' },
    inversePatch: { kind: 'noop' },
    createdAt: Date.now(),
    status: 'pending',
    retries: 0,
  };
}

beforeEach(async () => {
  useQueueStore.setState({ queue: [], hydrated: true });
  await AsyncStorage.clear();
});

describe('offline queue persistence (AsyncStorage)', () => {
  it('writes the queue to AsyncStorage when an action is enqueued', async () => {
    useQueueStore.getState().enqueue(sampleAction('act-1'));

    await new Promise(resolve => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.queue).toHaveLength(1);
    expect(parsed.state.queue[0].localId).toBe('act-1');
  });

  it('removing an action updates what is persisted', async () => {
    useQueueStore.getState().enqueue(sampleAction('act-1'));
    useQueueStore.getState().enqueue(sampleAction('act-2'));
    await new Promise(resolve => setTimeout(resolve, 0));

    useQueueStore.getState().removeAction('act-1');
    await new Promise(resolve => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.queue.map((a: QueueAction) => a.localId)).toEqual(['act-2']);
  });

  it('a queue persisted to storage rehydrates into a fresh store instance on next launch', async () => {
    const seeded = {
      state: { queue: [sampleAction('act-1'), sampleAction('act-2')] },
      version: 0,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    let freshQueueStore: typeof useQueueStore;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      freshQueueStore = require('../src/store/useQueueStore').useQueueStore;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(freshQueueStore!.getState().queue.map(a => a.localId)).toEqual(['act-1', 'act-2']);
  });

  it('resets actions left mid-send (or previously failed) back to pending on a cold start', async () => {
    const stuck = { ...sampleAction('act-1'), status: 'sending' as const, retries: 3 };
    const givenUp = { ...sampleAction('act-2'), status: 'failed' as const, retries: 8, lastError: 'boom' };
    const seeded = { state: { queue: [stuck, givenUp] }, version: 0 };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    let freshQueueStore: typeof useQueueStore;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      freshQueueStore = require('../src/store/useQueueStore').useQueueStore;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    const q = freshQueueStore!.getState().queue;
    expect(q.map(a => a.localId)).toEqual(['act-1', 'act-2']);
    expect(q.every(a => a.status === 'pending')).toBe(true);
    expect(q.every(a => a.retries === 0)).toBe(true);
    expect(q.every(a => a.lastError === undefined)).toBe(true);
  });
});
