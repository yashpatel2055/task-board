import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { QueueAction, QueueActionStatus } from '../types';

interface QueueStore {
  queue: QueueAction[];
  /** True once the persisted queue has been read back from AsyncStorage. */
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  enqueue: (action: QueueAction) => void;
  removeAction: (localId: string) => void;
  setStatus: (localId: string, status: QueueActionStatus, lastError?: string) => void;
  incrementRetries: (localId: string) => void;
  clear: () => void;
}

/**
 * The offline action queue, persisted to AsyncStorage so it survives an app
 * restart while offline. This is the thing the brief explicitly wants an
 * automated test against, so it's kept intentionally dumb: an ordered array
 * plus a handful of pure mutations. Ordering is FIFO by array position,
 * which is also insertion order -- actions are always pushed to the end and
 * the processor always drains from the front.
 */
export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      queue: [],
      hydrated: false,
      setHydrated: v => set({ hydrated: v }),

      enqueue: action => set({ queue: [...get().queue, action] }),

      removeAction: localId => set({ queue: get().queue.filter(a => a.localId !== localId) }),

      setStatus: (localId, status, lastError) =>
        set({
          queue: get().queue.map(a =>
            a.localId === localId ? { ...a, status, lastError } : a,
          ),
        }),

      incrementRetries: localId =>
        set({
          queue: get().queue.map(a =>
            a.localId === localId ? { ...a, retries: a.retries + 1 } : a,
          ),
        }),

      clear: () => set({ queue: [] }),
    }),
    {
      name: 'kanban-offline-queue',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the queue itself needs to survive a restart; `hydrated` is
      // runtime bookkeeping.
      partialize: state => ({ queue: state.queue }),
      onRehydrateStorage: () => state => {
        state?.setHydrated(true);
      },
    },
  ),
);
