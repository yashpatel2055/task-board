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

// A starter board so the app is usable immediately — before the socket
// connects, or if there's no server at all. The ids match the server seed,
// so once `board:init` arrives the reconciler updates these in place (server
// versions are higher) rather than creating duplicates.
function seedBoard(): BoardState {
  return {
    columns: [
      { id: 'col-todo', title: 'To Do', order: 0 },
      { id: 'col-in-progress', title: 'In Progress', order: 1 },
      { id: 'col-done', title: 'Done', order: 2 },
    ],
    cards: [
      {
        id: 'card-1',
        columnId: 'col-todo',
        title: 'Design the offline queue',
        description: 'Sketch out the patch/inverse-patch model.',
        assignee: 'Alex',
        order: 0,
        updatedAt: 0,
        version: 0,
      },
      {
        id: 'card-2',
        columnId: 'col-todo',
        title: 'Wire up socket.io mock server',
        description: '',
        assignee: 'Sam',
        order: 1,
        updatedAt: 0,
        version: 0,
      },
      {
        id: 'card-3',
        columnId: 'col-in-progress',
        title: 'Build draggable card component',
        description: 'gesture-handler + reanimated',
        assignee: 'Alex',
        order: 0,
        updatedAt: 0,
        version: 0,
      },
      {
        id: 'card-4',
        columnId: 'col-done',
        title: 'Scaffold project',
        description: '',
        assignee: 'Sam',
        order: 0,
        updatedAt: 0,
        version: 0,
      },
    ],
  };
}

export const useBoardStore = create<BoardStore>()(
  persist(
    (set, get) => ({
      ...seedBoard(),

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
      merge: (persisted, current) => {
        const saved = persisted as Partial<BoardState> | undefined;
        // If an earlier run persisted an empty board (e.g. it never reached a
        // server), fall back to the seed so the user isn't staring at a blank
        // screen with no way to add a card.
        if (!saved || !saved.columns || saved.columns.length === 0) {
          return { ...current, ...seedBoard() };
        }
        return { ...current, columns: saved.columns, cards: saved.cards ?? [] };
      },
    },
  ),
);
