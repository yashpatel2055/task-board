import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { QueueAction, QueueActionStatus } from '../types';

interface QueueStore {
  queue: QueueAction[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  enqueue: (action: QueueAction) => void;
  removeAction: (localId: string) => void;
  setStatus: (localId: string, status: QueueActionStatus, lastError?: string) => void;
  incrementRetries: (localId: string) => void;
  clear: () => void;
}

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
      partialize: state => ({ queue: state.queue }),
      merge: (persisted, current) => {
        const savedQueue = (persisted as { queue?: QueueAction[] } | undefined)?.queue ?? [];
        const queue = savedQueue.map(a =>
          a.status === 'pending'
            ? a
            : { ...a, status: 'pending' as QueueActionStatus, retries: 0, lastError: undefined },
        );
        return { ...current, queue };
      },
      onRehydrateStorage: () => state => {
        state?.setHydrated(true);
      },
    },
  ),
);
