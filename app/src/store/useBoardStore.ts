import { create } from 'zustand';
import { applyPatch, applyPatches } from '../engine/patch';
import { BoardPatch, BoardState } from '../types';

interface BoardStore extends BoardState {
  /** Replace the whole board (e.g. on initial `board:init` from the server, or a manual reset). */
  setBoard: (board: BoardState) => void;
  /** Apply one patch (optimistic apply, rollback, or a confirmed/remote merge). */
  apply: (patch: BoardPatch) => void;
  applyMany: (patches: BoardPatch[]) => void;
}

export const useBoardStore = create<BoardStore>((set, get) => ({
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
}));
