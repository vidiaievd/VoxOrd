import type { ApiError as ApiErrorType } from '../api/client';
import type { AccountPrefs } from '../api/accountPrefs';

/** In-memory stand-in for the device's async storage; survives a module reset (an app restart). */
const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: (ns: string) => ({
    getItem: async (key: string) => mockStorage.get(`${ns}/${key}`) ?? null,
    setItem: async (key: string, value: string) => {
      mockStorage.set(`${ns}/${key}`, value);
    },
  }),
}));

jest.mock('../api/accountPrefs', () => ({
  ...jest.requireActual('../api/accountPrefs'),
  getAccountPrefs: jest.fn(),
  patchAccountPrefs: jest.fn(),
}));

type Api = typeof import('../api/accountPrefs');
type Store = typeof import('./accountPrefsStore');
type Auth = typeof import('./authStore');

const LEARNER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };
const OTHER = { id: 'user-2', email: 'x@y.z', roles: ['student'] };

let ApiError: typeof ApiErrorType;
const offline = () =>
  new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });
const refused = (status: number) =>
  new ApiError({ message: 'refused', status, code: 'HTTP_ERROR' });

let api: jest.Mocked<Api>;
let store: Store['accountPrefsStore'];
let auth: Auth['authStore'];

/** A fresh app over the same device storage. */
function boot(user: typeof LEARNER | null = LEARNER) {
  jest.resetModules();
  api = require('../api/accountPrefs');
  ApiError = require('../api/client').ApiError;
  auth = require('./authStore').authStore;
  if (user) auth.setSignedIn(user);
  store = require('./accountPrefsStore').accountPrefsStore;
}

const prefs = (p: Partial<AccountPrefs> = {}): AccountPrefs => ({
  dailyGoalMin: null,
  translationLanguage: null,
  ...p,
});
/** The server echoes the patch over what it holds. */
let serverHolds: AccountPrefs;

beforeEach(() => {
  mockStorage.clear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  boot();
  serverHolds = prefs();
  api.getAccountPrefs.mockImplementation(async () => serverHolds);
  api.patchAccountPrefs.mockImplementation(async patch => {
    serverHolds = { ...serverHolds, ...patch };
    return serverHolds;
  });
});
afterEach(() => jest.restoreAllMocks());

describe('pure parts', () => {
  it('settle keeps a field changed again while the request flew', () => {
    const { settle } = jest.requireActual<Store>('./accountPrefsStore');
    expect(
      settle(
        { dailyGoalMin: 20, translationLanguage: 'en' },
        { dailyGoalMin: 15, translationLanguage: 'en' },
      ),
    ).toEqual({ dailyGoalMin: 20 });
  });
});

describe('accountPrefsStore', () => {
  it('reads the server and keeps it for the next start', async () => {
    serverHolds = prefs({ dailyGoalMin: 15, translationLanguage: 'uk' });
    await store.refresh();
    expect(store.getState().prefs).toEqual(serverHolds);

    api.getAccountPrefs.mockRejectedValue(offline());
    boot();
    await store.hydrate();
    expect(store.getState().prefs).toEqual({
      dailyGoalMin: 15,
      translationLanguage: 'uk',
    });
  });

  it('applies a change at once and sends it', async () => {
    await store.set('translationLanguage', 'en');
    expect(store.getState().prefs.translationLanguage).toBe('en');
    await store.flush();
    expect(api.patchAccountPrefs).toHaveBeenCalledWith({
      translationLanguage: 'en',
    });
    expect(store.getState().pending).toEqual({});
  });

  it('keeps a change made offline across a restart, newest value only, and sends it once back', async () => {
    api.patchAccountPrefs.mockRejectedValue(offline());
    await store.set('dailyGoalMin', 15);
    await store.set('dailyGoalMin', 30);
    await store.flush();
    expect(store.getState().pending).toEqual({ dailyGoalMin: 30 });

    boot();
    await store.hydrate();
    expect(store.getState().prefs.dailyGoalMin).toBe(30);

    api.patchAccountPrefs.mockImplementation(async patch => ({
      ...serverHolds,
      ...patch,
    }));
    // A refresh before the flush must not bring the server's old value back.
    await store.refresh();
    expect(store.getState().prefs.dailyGoalMin).toBe(30);
    await store.sync();
    expect(api.patchAccountPrefs).toHaveBeenLastCalledWith({ dailyGoalMin: 30 });
    expect(store.getState().pending).toEqual({});
  });

  it('drops a change the server refuses for good', async () => {
    api.patchAccountPrefs.mockRejectedValue(refused(403));
    await store.set('dailyGoalMin', 15);
    await store.flush();
    expect(store.getState().pending).toEqual({});
    expect(store.getState().prefs.dailyGoalMin).toBeNull();
  });

  it('never shows one learner the choices of another', async () => {
    api.patchAccountPrefs.mockRejectedValue(offline());
    await store.set('translationLanguage', 'uk');

    auth.setSignedIn(OTHER);
    await store.hydrate();
    expect(store.getState()).toMatchObject({
      userId: 'user-2',
      prefs: prefs(),
      pending: {},
    });
    await store.flush();
    expect(api.patchAccountPrefs).toHaveBeenCalledTimes(1); // only the first learner's try

    auth.setSignedIn(LEARNER);
    await store.hydrate();
    expect(store.getState().pending).toEqual({ translationLanguage: 'uk' });
  });
});
