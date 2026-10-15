// The default instance wires native modules and stores; the tests build their own.
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn() }));
jest.mock('../api/auth', () => ({ authService: {} }));
jest.mock('../store/reviewQueueStore', () => ({ reviewQueueStore: {} }));
jest.mock('../store/wordCaptureQueueStore', () => ({ wordCaptureQueueStore: {} }));
jest.mock('./vocabularyReplica', () => ({ vocabularyReplica: {} }));
jest.mock('./courseDownload', () => ({ courseDownloader: {} }));
jest.mock('../store/exerciseOutboxStore', () => ({ exerciseOutboxStore: {} }));

import { SessionSync, type SessionSyncDeps } from './sessionSync';
import type { AuthState } from '../store/authStore';

const USER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OFFLINE: AuthState = { status: 'signedIn', user: USER, offline: true };
const ONLINE: AuthState = { status: 'signedIn', user: USER, offline: false };

/** A device, a session and two queues the test drives by hand. */
function makeWorld(initial: AuthState) {
  let auth = initial;
  let network: ((connected: boolean) => void) | null = null;
  let foreground: (() => void) | null = null;
  const authListeners = new Set<() => void>();
  const sent: string[] = [];

  const setAuth = (next: AuthState) => {
    auth = next;
    authListeners.forEach(l => l());
  };

  const deps: SessionSyncDeps = {
    onNetworkChange: l => {
      network = l;
      return () => (network = null);
    },
    onForeground: l => {
      foreground = l;
      return () => (foreground = null);
    },
    getAuth: () => auth,
    onAuthChange: l => {
      authListeners.add(l);
      return () => authListeners.delete(l);
    },
    reconnect: jest.fn(async () => undefined),
    queues: [
      { name: 'reviews', flush: jest.fn(async () => sent.push('reviews')) },
      { name: 'captured words', flush: jest.fn(async () => sent.push('captured words')) },
    ],
  };

  return {
    deps,
    sent,
    setAuth,
    networkUp: () => network!(true),
    networkDown: () => network!(false),
    foreground: () => foreground!(),
    hasListeners: () => network !== null || foreground !== null || authListeners.size > 0,
  };
}

const settle = () => new Promise<void>(resolve => setImmediate(() => resolve()));

describe('SessionSync', () => {
  it('reconnects an offline session when the network comes up', async () => {
    const world = makeWorld(OFFLINE);
    new SessionSync(world.deps).start();

    world.networkUp();
    await settle();

    expect(world.deps.reconnect).toHaveBeenCalledTimes(1);
    // Still offline: nothing is sent into a connection the server is not on.
    expect(world.sent).toEqual([]);
  });

  it('does nothing when the network goes down', async () => {
    const world = makeWorld(OFFLINE);
    new SessionSync(world.deps).start();

    world.networkDown();
    await settle();

    expect(world.deps.reconnect).not.toHaveBeenCalled();
  });

  it('reconnects when the app comes back to the foreground', async () => {
    const world = makeWorld(OFFLINE);
    new SessionSync(world.deps).start();

    world.foreground();
    await settle();

    expect(world.deps.reconnect).toHaveBeenCalledTimes(1);
  });

  it('makes one attempt for a burst of events', async () => {
    const world = makeWorld(OFFLINE);
    let finish: (() => void) | null = null;
    world.deps.reconnect = jest.fn(() => new Promise<void>(resolve => (finish = resolve)));
    new SessionSync(world.deps).start();

    world.networkUp();
    world.foreground();
    world.networkUp();
    await settle();
    finish!();
    await settle();

    expect(world.deps.reconnect).toHaveBeenCalledTimes(1);
  });

  it('sends the queues in order once the session is back online', async () => {
    const world = makeWorld(OFFLINE);
    new SessionSync(world.deps).start();

    world.setAuth(ONLINE);
    await settle();

    expect(world.sent).toEqual(['reviews', 'captured words']);
  });

  it('sends the queues after a sign-in', async () => {
    const world = makeWorld({ status: 'signedOut', user: null, offline: false });
    new SessionSync(world.deps).start();

    world.setAuth(ONLINE);
    await settle();

    expect(world.sent).toEqual(['reviews', 'captured words']);
  });

  it('does not send again on a change that keeps the session online', async () => {
    const world = makeWorld(OFFLINE);
    new SessionSync(world.deps).start();
    world.setAuth(ONLINE);
    await settle();

    world.setAuth({ ...ONLINE });
    await settle();

    expect(world.sent).toEqual(['reviews', 'captured words']);
  });

  it('sends what is left when online and the network comes up, without a reconnect', async () => {
    const world = makeWorld(ONLINE);
    new SessionSync(world.deps).start();
    await settle();
    world.sent.length = 0;

    world.networkUp();
    await settle();

    expect(world.deps.reconnect).not.toHaveBeenCalled();
    expect(world.sent).toEqual(['reviews', 'captured words']);
  });

  it('keeps sending the other queues when one fails', async () => {
    const world = makeWorld(OFFLINE);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (world.deps.queues[0].flush as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    new SessionSync(world.deps).start();

    world.setAuth(ONLINE);
    await settle();

    expect(world.sent).toEqual(['captured words']);
  });

  it('stops sending when the session drops mid-drain', async () => {
    const world = makeWorld(OFFLINE);
    (world.deps.queues[0].flush as jest.Mock).mockImplementationOnce(async () => {
      world.sent.push('reviews');
      world.setAuth({ status: 'signedOut', user: null, offline: false });
    });
    new SessionSync(world.deps).start();

    world.setAuth(ONLINE);
    await settle();

    expect(world.sent).toEqual(['reviews']);
  });

  it('runs once more when a drain is asked for while one runs', async () => {
    const world = makeWorld(ONLINE);
    let release: (() => void) | null = null;
    (world.deps.queues[0].flush as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(resolve => (release = resolve)),
    );
    const sync = new SessionSync(world.deps);
    sync.start();
    await settle();

    void sync.drain();
    release!();
    await settle();

    // First pass: reviews held open, then words; second pass: both again.
    expect(world.sent).toEqual(['captured words', 'reviews', 'captured words']);
  });

  it('lets go of every listener on stop', () => {
    const world = makeWorld(OFFLINE);
    const sync = new SessionSync(world.deps);
    sync.start();

    sync.stop();

    expect(world.hasListeners()).toBe(false);
  });
});
