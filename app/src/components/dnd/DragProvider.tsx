import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useSharedValue, SharedValue } from 'react-native-reanimated';
import { Card } from '../../types';

interface ColumnLayout {
  columnId: string;
  pageX: number;
  pageY: number;
  width: number;
  height: number;
}

interface CardLayout {
  cardId: string;
  columnId: string;
  pageY: number;
  height: number;
  order: number;
}

interface DragContextValue {
  registerColumnRef: (columnId: string, ref: React.RefObject<View>) => void;
  registerCardRef: (cardId: string, columnId: string, order: number, ref: React.RefObject<View>) => void;
  unregisterCardRef: (cardId: string) => void;

  draggingCardId: string | null;
  isDragging: boolean;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  draggingCard: Card | null;

  beginDrag: (card: Card, originPageX: number, originPageY: number) => void;
  endDrag: (absoluteX: number, absoluteY: number) => void;
  cancelDrag: () => void;
}

const DragContext = createContext<DragContextValue | null>(null);

export function useDragContext(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) throw new Error('useDragContext must be used within a DragProvider');
  return ctx;
}

interface Props {
  children: React.ReactNode;
  /** Called once hit-testing resolves a drop to a (possibly unchanged) column + index. */
  onDrop: (cardId: string, toColumnId: string, toIndex: number) => void;
}

/**
 * Coordinates cross-column drag-and-drop without a third-party DnD library.
 *
 * Strategy: while nothing is being dragged, every column and every card
 * registers a ref. The moment a drag begins we freeze scrolling (both the
 * horizontal column row and each column's own vertical list -- see
 * `isDragging` consumed by Column.tsx) and take one fresh `measure()` pass
 * over every registered column/card to get their absolute page coordinates.
 * Because scrolling is frozen for the duration of the gesture, those
 * coordinates stay valid all the way to `onEnd`, which is what lets the
 * drop hit-test just be "which column's x-range contains the finger" and
 * "how many cards in that column sit above the finger's y" -- no scroll
 * offset math needed.
 */
export function DragProvider({ children, onDrop }: Props) {
  const columnRefs = useRef(new Map<string, React.RefObject<View>>());
  const cardRefs = useRef(new Map<string, { columnId: string; order: number; ref: React.RefObject<View> }>());

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const originX = useRef(0);
  const originY = useRef(0);

  const columnLayouts = useRef<ColumnLayout[]>([]);
  const cardLayouts = useRef<CardLayout[]>([]);

  const registerColumnRef = useCallback((columnId: string, ref: React.RefObject<View>) => {
    columnRefs.current.set(columnId, ref);
  }, []);

  const registerCardRef = useCallback(
    (cardId: string, columnId: string, order: number, ref: React.RefObject<View>) => {
      cardRefs.current.set(cardId, { columnId, order, ref });
    },
    [],
  );

  const unregisterCardRef = useCallback((cardId: string) => {
    cardRefs.current.delete(cardId);
  }, []);

  const measureAll = useCallback((excludeCardId: string) => {
    const columns: ColumnLayout[] = [];
    const cards: CardLayout[] = [];

    columnRefs.current.forEach((ref, columnId) => {
      ref.current?.measure((_x, _y, width, height, pageX, pageY) => {
        columns.push({ columnId, pageX, pageY, width, height });
      });
    });

    cardRefs.current.forEach(({ columnId, order, ref }, cardId) => {
      if (cardId === excludeCardId) return;
      ref.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
        cards.push({ cardId, columnId, pageY, height, order });
      });
    });

    columnLayouts.current = columns;
    cardLayouts.current = cards;
  }, []);

  const beginDrag = useCallback(
    (card: Card, originPageX: number, originPageY: number) => {
      measureAll(card.id);
      originX.current = originPageX;
      originY.current = originPageY;
      translateX.value = originPageX;
      translateY.value = originPageY;
      setDraggingCardId(card.id);
      setDraggingCard(card);
    },
    [measureAll, translateX, translateY],
  );

  const endDrag = useCallback(
    (absoluteX: number, absoluteY: number) => {
      const columns = columnLayouts.current;
      const cards = cardLayouts.current;

      if (draggingCard && columns.length > 0) {
        // Which column's horizontal span contains the drop point? Fall back
        // to the closest column center if the finger ended up just outside
        // every span (e.g. dropped past the last column's right edge).
        let targetColumn =
          columns.find(c => absoluteX >= c.pageX && absoluteX <= c.pageX + c.width) ?? null;
        if (!targetColumn) {
          targetColumn = columns.reduce((closest, c) => {
            const center = c.pageX + c.width / 2;
            const closestCenter = closest.pageX + closest.width / 2;
            return Math.abs(absoluteX - center) < Math.abs(absoluteX - closestCenter) ? c : closest;
          }, columns[0]);
        }

        // Within that column, count how many cards sit above the drop
        // point (by their vertical midpoint) -- that count is the index.
        const cardsInTarget = cards
          .filter(c => c.columnId === targetColumn!.columnId)
          .sort((a, b) => a.order - b.order);
        let targetIndex = 0;
        for (const c of cardsInTarget) {
          const midY = c.pageY + c.height / 2;
          if (absoluteY > midY) targetIndex += 1;
          else break;
        }

        onDrop(draggingCard.id, targetColumn.columnId, targetIndex);
      }

      setDraggingCardId(null);
      setDraggingCard(null);
      columnLayouts.current = [];
      cardLayouts.current = [];
    },
    [draggingCard, onDrop],
  );

  const cancelDrag = useCallback(() => {
    setDraggingCardId(null);
    setDraggingCard(null);
    columnLayouts.current = [];
    cardLayouts.current = [];
  }, []);

  const value = useMemo<DragContextValue>(
    () => ({
      registerColumnRef,
      registerCardRef,
      unregisterCardRef,
      draggingCardId,
      isDragging: draggingCardId !== null,
      translateX,
      translateY,
      draggingCard,
      beginDrag,
      endDrag,
      cancelDrag,
    }),
    [registerColumnRef, registerCardRef, unregisterCardRef, draggingCardId, translateX, translateY, draggingCard, beginDrag, endDrag, cancelDrag],
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}
