import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { applyPatch, applyPatches } from '../engine/patch';
import { BoardPatch, BoardState } from '../types';

interface BoardStore extends BoardState {
  setBoard: (board: BoardState) => void;
  apply: (patch: BoardPatch) => void;
  applyMany: (patches: BoardPatch[]) => void;
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      columns: [],
      cards: [],

      setBoard: board => set({ columns: board.columns, cards: board.cards }),

      apply: patch => {
        const next = applyPatch({ columns: get().columns, cards: get().cards }, patch);
        set({ columns: next.columns, cards: next.cards });
      },

      applyMany: patches => {
        const next = applyPatches({ columns: get().columns, cards: get().cards }, patches);
        set({ columns: next.columns, cards: next.cards });
      },
    }),
    {
      name: 'kanban-board-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ columns: state.columns, cards: state.cards }),
    },
  ),
);
