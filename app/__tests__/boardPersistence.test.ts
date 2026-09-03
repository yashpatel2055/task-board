import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBoardStore } from '../src/store/useBoardStore';
import { BoardState } from '../src/types';

const STORAGE_KEY = 'kanban-board-state';

function sampleBoard(): BoardState {
  return {
    columns: [{ id: 'col-a', title: 'To Do', order: 0 }],
    cards: [
      { id: 'card-1', columnId: 'col-a', title: 'Persisted card', order: 0, updatedAt: 1000, version: 1 },
    ],
  };
}

beforeEach(async () => {
  useBoardStore.setState({ columns: [], cards: [] });
  await AsyncStorage.clear();
});

describe('board projection persistence (AsyncStorage)', () => {
  it('writes the board to AsyncStorage when a patch is applied', async () => {
    useBoardStore.getState().setBoard(sampleBoard());
    useBoardStore.getState().apply({
      kind: 'upsertCard',
      card: { id: 'card-2', columnId: 'col-a', title: 'Added offline', order: 1, updatedAt: 2000, version: 0 },
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.cards.map((c: { id: string }) => c.id)).toEqual(['card-1', 'card-2']);
  });

  it('a board persisted to storage rehydrates into a fresh store instance on next launch', async () => {
    const seeded = {
      state: {
        columns: [{ id: 'col-a', title: 'To Do', order: 0 }],
        cards: [
          { id: 'card-1', columnId: 'col-a', title: 'Survived the relaunch', order: 0, updatedAt: 1, version: 1 },
        ],
      },
      version: 0,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));

    let freshBoardStore: typeof useBoardStore;
    await jest.isolateModulesAsync(async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      freshBoardStore = require('../src/store/useBoardStore').useBoardStore;
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(freshBoardStore!.getState().cards.map(c => c.title)).toEqual(['Survived the relaunch']);
  });
});
