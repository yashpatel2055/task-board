import { create } from 'zustand';

interface NetworkStore {
  isOnline: boolean;
  isSocketConnected: boolean;
  setOnline: (v: boolean) => void;
  setSocketConnected: (v: boolean) => void;
}

export const useNetworkStore = create<NetworkStore>(set => ({
  isOnline: true,
  isSocketConnected: false,
  setOnline: v => set({ isOnline: v }),
  setSocketConnected: v => set({ isSocketConnected: v }),
}));
