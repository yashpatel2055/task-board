export type ID = string;

export interface Card {
  id: ID;
  columnId: ID;
  title: string;
  description?: string;
  assignee?: string;
  imageUri?: string;
  order: number;
  updatedAt: number;
  version: number;
}

export interface Column {
  id: ID;
  title: string;
  order: number;
}

export interface BoardState {
  columns: Column[];
  cards: Card[];
}

export type ActionType = 'CREATE_CARD' | 'UPDATE_CARD' | 'DELETE_CARD' | 'MOVE_CARD';

export interface CreateCardPayload {
  card: Card;
}

export interface UpdateCardPayload {
  cardId: ID;
  changes: Partial<Pick<Card, 'title' | 'description' | 'assignee' | 'imageUri'>>;
}

export interface DeleteCardPayload {
  cardId: ID;
}

export interface MoveCardPayload {
  cardId: ID;
  toColumnId: ID;
  order: number;
}

export type ActionPayload =
  | CreateCardPayload
  | UpdateCardPayload
  | DeleteCardPayload
  | MoveCardPayload;

export type BoardPatch =
  | { kind: 'upsertCard'; card: Card }
  | { kind: 'removeCard'; cardId: ID; version?: number }
  | { kind: 'noop' };

export type QueueActionStatus = 'pending' | 'sending' | 'failed';

export interface QueueAction {
  localId: ID;
  type: ActionType;
  payload: ActionPayload;
  forwardPatch: BoardPatch;
  inversePatch: BoardPatch;
  createdAt: number;
  status: QueueActionStatus;
  retries: number;
  lastError?: string;
}

export interface ServerAckSuccess {
  ok: true;
  patch: BoardPatch;
}

export interface ServerAckFailure {
  ok: false;
  error: string;
}

export type ServerAck = ServerAckSuccess | ServerAckFailure;
