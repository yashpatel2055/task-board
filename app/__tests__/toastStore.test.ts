import { useToastStore } from '../src/store/useToastStore';

beforeEach(() => {
  useToastStore.setState({
    visible: false,
    message: '',
    durationMs: 3000,
    actionLabel: undefined,
    onAction: undefined,
    onExpire: undefined,
    seq: 0,
  });
});

describe('useToastStore', () => {
  it('flushes the outgoing toast\'s onExpire when a new toast replaces it', () => {
    const firstExpire = jest.fn();
    useToastStore.getState().show({ message: '"A" deleted', durationMs: 5000, onExpire: firstExpire });
    useToastStore.getState().show({ message: '"B" deleted', durationMs: 5000, onExpire: jest.fn() });

    expect(firstExpire).toHaveBeenCalledTimes(1);
  });

  it('does not leak actionLabel / onAction / onExpire from a previous toast', () => {
    useToastStore.getState().show({
      message: '"A" deleted',
      actionLabel: 'Undo',
      durationMs: 5000,
      onAction: jest.fn(),
      onExpire: jest.fn(),
    });
    useToastStore.getState().show({ message: 'The server rejected that change.', durationMs: 4000 });

    const s = useToastStore.getState();
    expect(s.actionLabel).toBeUndefined();
    expect(s.onAction).toBeUndefined();
    expect(s.onExpire).toBeUndefined();
  });

  it('bumps seq on every show so an identical-text toast still restarts the timer', () => {
    useToastStore.getState().show({ message: 'same text', durationMs: 4000 });
    const first = useToastStore.getState().seq;
    useToastStore.getState().show({ message: 'same text', durationMs: 4000 });
    expect(useToastStore.getState().seq).toBe(first + 1);
  });

  it('hide() does not fire onExpire', () => {
    const onExpire = jest.fn();
    useToastStore.getState().show({ message: 'x', durationMs: 5000, onExpire });
    useToastStore.getState().hide();
    expect(onExpire).not.toHaveBeenCalled();
    expect(useToastStore.getState().visible).toBe(false);
  });
});
