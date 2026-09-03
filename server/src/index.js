const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;

function now() {
  return Date.now();
}

let nextVersion = 1;

function seedBoard() {
  const t = now();
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
        imageUri: undefined,
        order: 0,
        updatedAt: t,
        version: nextVersion++,
      },
      {
        id: 'card-2',
        columnId: 'col-todo',
        title: 'Wire up socket.io mock server',
        description: '',
        assignee: 'Sam',
        imageUri: undefined,
        order: 1,
        updatedAt: t,
        version: nextVersion++,
      },
      {
        id: 'card-3',
        columnId: 'col-in-progress',
        title: 'Build draggable card component',
        description: 'gesture-handler + reanimated',
        assignee: 'Alex',
        imageUri: undefined,
        order: 0,
        updatedAt: t,
        version: nextVersion++,
      },
      {
        id: 'card-4',
        columnId: 'col-done',
        title: 'Scaffold project',
        description: '',
        assignee: 'Sam',
        imageUri: undefined,
        order: 0,
        updatedAt: t,
        version: nextVersion++,
      },
    ],
  };
}

let board = seedBoard();

const RANDOM_REJECT_RATE = 0.08;

function shouldReject(action) {
  const title =
    (action.payload && (action.payload.title || (action.payload.changes && action.payload.changes.title))) ||
    '';
  if (typeof title === 'string' && title.toUpperCase().includes('FAIL')) {
    return 'Rejected: title contains the demo trigger word "FAIL".';
  }
  if (Math.random() < RANDOM_REJECT_RATE) {
    return 'Rejected: simulated server-side validation failure.';
  }
  return null;
}

function applyAction(action) {
  const { type, payload } = action;

  switch (type) {
    case 'CREATE_CARD': {
      const card = {
        ...payload.card,
        updatedAt: now(),
        version: nextVersion++,
      };
      board.cards.push(card);
      return { kind: 'upsertCard', card };
    }

    case 'UPDATE_CARD': {
      const idx = board.cards.findIndex(c => c.id === payload.cardId);
      if (idx === -1) throw new Error('Card not found');
      const updated = {
        ...board.cards[idx],
        ...payload.changes,
        updatedAt: now(),
        version: nextVersion++,
      };
      board.cards[idx] = updated;
      return { kind: 'upsertCard', card: updated };
    }

    case 'DELETE_CARD': {
      board.cards = board.cards.filter(c => c.id !== payload.cardId);
      return { kind: 'removeCard', cardId: payload.cardId, version: nextVersion++ };
    }

    case 'MOVE_CARD': {
      const idx = board.cards.findIndex(c => c.id === payload.cardId);
      if (idx === -1) throw new Error('Card not found');
      const updated = {
        ...board.cards[idx],
        columnId: payload.toColumnId,
        order: payload.order,
        updatedAt: now(),
        version: nextVersion++,
      };
      board.cards[idx] = updated;
      return { kind: 'upsertCard', card: updated };
    }

    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, cards: board.cards.length, connections: io.engine.clientsCount });
});

app.get('/board', (_req, res) => res.json(board));

app.post('/reset', (_req, res) => {
  board = seedBoard();
  io.emit('board:init', board);
  res.json({ ok: true });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', socket => {
  // eslint-disable-next-line no-console
  console.log(`[server] client connected: ${socket.id} (${io.engine.clientsCount} total)`);

  socket.emit('board:init', board);

  socket.on('board:action', (action, ack) => {
    try {
      const rejectReason = shouldReject(action);
      if (rejectReason) {
        // eslint-disable-next-line no-console
        console.log(`[server] rejected ${action.type} (${action.localId}): ${rejectReason}`);
        if (typeof ack === 'function') ack({ ok: false, error: rejectReason });
        return;
      }

      const patch = applyAction(action);

      const latency = 150 + Math.random() * 500;
      setTimeout(() => {
        if (typeof ack === 'function') ack({ ok: true, patch });
        socket.broadcast.emit('board:remote-update', patch);
      }, latency);
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message || 'Unknown server error' });
    }
  });

  socket.on('disconnect', () => {
    // eslint-disable-next-line no-console
    console.log(`[server] client disconnected: ${socket.id} (${io.engine.clientsCount} total)`);
  });
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Kanban mock server listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[server] Demo tip: give a card the title "trigger FAIL" to force a rejection.`);
});
