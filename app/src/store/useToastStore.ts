import { create } from 'zustand';

export interface ToastState {
  visible: boolean;
  message: string;
  actionLabel?: string;
  durationMs: number;
  onAction?: () => void;
  onExpire?: () => void;
  seq: number;
}

interface ToastStore extends ToastState {
  show: (toast: Omit<ToastState, 'visible' | 'seq'>) => void;
  hide: () => void;
}

const DEFAULT: ToastState = {
  visible: false,
  message: '',
  actionLabel: undefined,
  durationMs: 3000,
  onAction: undefined,
  onExpire: undefined,
  seq: 0,
};

export const useToastStore = create<ToastStore>((set, get) => ({
  ...DEFAULT,
  show: toast => {
    const prev = get();
    if (prev.visible && prev.onExpire) prev.onExpire();
    set({ ...DEFAULT, ...toast, seq: prev.seq + 1, visible: true });
  },
  hide: () => set({ visible: false }),
}));
