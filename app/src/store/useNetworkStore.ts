import { create } from 'zustand';

interface NetworkStore {
  isOnline: boolean;
  isSocketConnected: boolean;
  setOnline: (v: boolean) => void;
  setSocketConnected: (v: boolean) => void;
}

/**
 * Two separate flags on purpose: `isOnline` reflects the device's network
 * reachability (NetInfo), `isSocketConnected` reflects whether our socket
 * has actually completed a handshake with the mock server. A device can be
 * "online" per NetInfo while the server is unreachable/restarting, and the
 * queue processor should only attempt sends when both are true.
 */
export const useNetworkStore = create<NetworkStore>(set => ({
  isOnline: true,
  isSocketConnected: false,
  setOnline: v => set({ isOnline: v }),
  setSocketConnected: v => set({ isSocketConnected: v }),
}));
