import { create } from 'zustand';

export interface ToastState {
  visible: boolean;
  message: string;
  actionLabel?: string;
  durationMs: number;
  onAction?: () => void;
  onExpire?: () => void;
}

interface ToastStore extends ToastState {
  show: (toast: Omit<ToastState, 'visible'>) => void;
  hide: () => void;
}

const DEFAULT: ToastState = {
  visible: false,
  message: '',
  durationMs: 3000,
};

/**
 * A single, app-wide toast/snackbar. Used for two things:
 *  - Undo affordance on destructive actions (5s window, `actionLabel: 'Undo'`).
 *  - Error surfacing when the server rejects an optimistic change.
 * One at a time is enough for this app's scope; a new toast simply replaces
 * whatever's showing.
 */
export const useToastStore = create<ToastStore>(set => ({
  ...DEFAULT,
  show: toast => set({ ...toast, visible: true }),
  hide: () => set({ visible: false }),
}));
