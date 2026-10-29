import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useKeepUnreadFresh, UNREAD_MAX_AGE_MS } from './useUnreadCount';

const mockStore = {
  hydrate: jest.fn(() => Promise.resolve()),
  refreshIfStale: jest.fn(() => Promise.resolve()),
  refresh: jest.fn(() => Promise.resolve()),
  subscribe: jest.fn(() => () => {}),
  getState: jest.fn(() => ({ unreadCount: 0 })),
};
jest.mock('../store/notificationsStore', () => ({
  get notificationsStore() {
    return mockStore;
  },
}));
let mockStatus = 'signedIn';
jest.mock('./useAuth', () => ({ useAuth: () => ({ status: mockStatus }) }));

function Probe({ k }: { k: string }) {
  useKeepUnreadFresh(k);
  return null;
}
const flush = () => act(async () => {});

describe('useKeepUnreadFresh', () => {
  let listener: ((s: string) => void) | undefined;
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'signedIn';
    listener = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: (s: string) => void,
    ) => {
      listener = cb;
      return { remove: jest.fn() };
    }) as never);
  });

  it('fetches a stale feed on start and again on arrival at another screen', async () => {
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe k="Today" />);
    });
    await flush();
    expect(mockStore.refreshIfStale).toHaveBeenCalledWith(UNREAD_MAX_AGE_MS);
    await act(async () => tree.update(<Probe k="Courses" />));
    await flush();
    expect(mockStore.refreshIfStale).toHaveBeenCalledTimes(2);
  });

  it('refetches when the app comes back to the foreground', async () => {
    await act(async () => {
      renderer.create(<Probe k="Today" />);
    });
    act(() => listener?.('background'));
    act(() => listener?.('active'));
    expect(mockStore.refresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing while signed out', async () => {
    mockStatus = 'signedOut';
    await act(async () => {
      renderer.create(<Probe k="Today" />);
    });
    act(() => listener?.('background'));
    act(() => listener?.('active'));
    expect(mockStore.hydrate).not.toHaveBeenCalled();
    expect(mockStore.refresh).not.toHaveBeenCalled();
  });
});
