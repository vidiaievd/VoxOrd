import { AppState } from 'react-native';
import { whenInForeground } from './tokenStorage';

type Listener = (state: string) => void;

describe('whenInForeground', () => {
  let listeners: Listener[];
  let remove: jest.Mock;

  const setState = (state: string) =>
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });

  beforeEach(() => {
    listeners = [];
    remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, l: Listener) => {
      listeners.push(l);
      return { remove } as never;
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('goes on at once in the foreground, and on an unknown state', async () => {
    setState('active');
    await whenInForeground();
    setState('unknown');
    await whenInForeground();
    expect(listeners).toHaveLength(0);
  });

  it('waits in the background until the app is active (the prompt cannot show before)', async () => {
    setState('background');
    let done = false;
    const waiting = whenInForeground().then(() => {
      done = true;
    });
    listeners.forEach(l => l('inactive'));
    await Promise.resolve();
    expect(done).toBe(false);
    listeners.forEach(l => l('active'));
    await waiting;
    expect(done).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
