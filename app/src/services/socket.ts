import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from './config';
import { BoardPatch, BoardState, QueueAction, ServerAck } from '../types';
import { useNetworkStore } from '../store/useNetworkStore';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      // Start on long-polling and let Engine.IO upgrade to WebSocket. A
      // websocket-only client silently fails on networks/proxies that block the
      // raw upgrade, which looks identical to "server is down".
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on('connect', () => useNetworkStore.getState().setSocketConnected(true));
    socket.on('disconnect', () => useNetworkStore.getState().setSocketConnected(false));
    socket.on('connect_error', () => useNetworkStore.getState().setSocketConnected(false));
  }
  return socket;
}

export function onBoardInit(callback: (board: BoardState) => void): () => void {
  const s = getSocket();
  s.on('board:init', callback);
  return () => {
    s.off('board:init', callback);
  };
}

export function onRemoteUpdate(callback: (patch: BoardPatch) => void): () => void {
  const s = getSocket();
  s.on('board:remote-update', callback);
  return () => {
    s.off('board:remote-update', callback);
  };
}

const ACK_TIMEOUT_MS = 6000;

export type SendResult = ServerAck | { ok: false; error: 'TIMEOUT' };

export function sendAction(action: QueueAction): Promise<SendResult> {
  const s = getSocket();
  return new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'TIMEOUT' });
    }, ACK_TIMEOUT_MS);

    s.emit(
      'board:action',
      { localId: action.localId, type: action.type, payload: action.payload },
      (ack: ServerAck) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ack);
      },
    );
  });
}
