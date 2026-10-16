import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { OfflineSessionBanner } from './OfflineSessionBanner';
import { authStore } from '../store/authStore';

jest.mock('../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'en',
  }),
}));

jest.mock('../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../theme/colors').lightColors,
  }),
}));

let mockPending = 0;
let mockNearlyFull = false;
jest.mock('../hooks/usePendingSync', () => ({
  usePendingSync: () => mockPending,
  useSyncQueueNearlyFull: () => mockNearlyFull,
}));

const USER = { id: 'user-1', email: 'a@b.c', roles: ['student'] };

function texts(renderer: ReactTestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text).map(n => String(n.props.children));
}

describe('OfflineSessionBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPending = 0;
    mockNearlyFull = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits out the moment a start takes to confirm the session', () => {
    authStore.setSignedIn(USER, true);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<OfflineSessionBanner />);
    });
    expect(texts(renderer)).toEqual([]);

    // Confirmed within the moment: nothing ever showed.
    act(() => authStore.setSignedIn(USER));
    act(() => jest.advanceTimersByTime(5000));
    expect(texts(renderer)).toEqual([]);
  });

  it('shows while offline, with what is waiting, and goes when the session is back', () => {
    mockPending = 3;
    authStore.setSignedIn(USER, true);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<OfflineSessionBanner />);
    });
    act(() => jest.advanceTimersByTime(2000));

    expect(texts(renderer)).toEqual([
      'auth.offlineSessionBanner',
      'auth.offlineSessionPending {"count":3}',
    ]);

    act(() => authStore.setSignedIn(USER));
    expect(texts(renderer)).toEqual([]);
  });

  it('warns when a queue is close to dropping the oldest answers (offline plan, B7.5)', () => {
    mockPending = 2500;
    mockNearlyFull = true;
    authStore.setSignedIn(USER, true);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<OfflineSessionBanner />);
    });
    act(() => jest.advanceTimersByTime(2000));

    expect(texts(renderer)).toContain('auth.offlineQueueNearlyFull');
  });

  it('says nothing about waiting answers when there are none', () => {
    authStore.setSignedIn(USER, true);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<OfflineSessionBanner />);
    });
    act(() => jest.advanceTimersByTime(2000));

    expect(texts(renderer)).toEqual(['auth.offlineSessionBanner']);
  });
});
