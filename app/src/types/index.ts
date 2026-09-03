export type ID = string;

export interface Card {
  id: ID;
  columnId: ID;
  title: string;
  description?: string;
  assignee?: string;
  /** Local file URI (or remote URL once synced) of the attached photo, if any. */
  imageUri?: string;
  /** Fractional order within its column. Lower sorts first. */
  order: number;
  /** Server-assigned timestamp of the last confirmed write. Drives last-write-wins conflict resolution. */
  updatedAt: number;
  /** Server-assigned monotonic version, bumped on every confirmed write. */
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

// -----------------------------------------------------------------------
// Actions the user can take. Each one is turned into a forward patch
// (applied immediately, optimistically) and an inverse patch (applied if
// the server rejects it), plus a network payload sent to the server.
// -----------------------------------------------------------------------

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

// -----------------------------------------------------------------------
// Patches: the actual unit of state change. `applyPatch(state, patch)` is a
// pure function, which is what makes rollback (apply the inverse) and remote
// merge (apply an incoming confirmed patch) both go through one code path.
// -----------------------------------------------------------------------

export type BoardPatch =
  | { kind: 'upsertCard'; card: Card }
  | { kind: 'removeCard'; cardId: ID }
  | { kind: 'noop' };

export type QueueActionStatus = 'pending' | 'sending' | 'failed';

export interface QueueAction {
  /** Client-generated id for this queued action (distinct from any card id). */
  localId: ID;
  type: ActionType;
  /** What gets sent to the server. */
  payload: ActionPayload;
  /** Applied immediately against the board store when the action is created. */
  forwardPatch: BoardPatch;
  /** Applied against the board store if the server rejects this action. */
  inversePatch: BoardPatch;
  createdAt: number;
  status: QueueActionStatus;
  retries: number;
  /** Set once the server rejects this action, for surfacing in the UI/toast. */
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
