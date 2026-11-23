import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { authStore } from '../../store/authStore';

jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (k: string, v?: Record<string, unknown>) => (v ? `${k} ${JSON.stringify(v)}` : k),
    language: 'en',
  }),
}));
jest.mock('../../providers/ThemeProvider', () => {
  const actual = jest.requireActual('../../theme/colors');
  return { useTheme: () => ({ colors: actual.lightColors }) };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});
jest.mock('./LoginForm', () => {
  const { Text } = jest.requireActual('react-native');
  return { LoginForm: () => <Text>login-form</Text> };
});
jest.mock('../../api/auth', () => ({ authService: { restore: jest.fn() } }));

const mockUnsent = jest.fn<number, [string | null]>();
jest.mock('../../hooks/usePendingSync', () => ({
  usePendingSyncOf: (userId: string | null) => mockUnsent(userId),
}));

import { AuthScreen } from './index';

const LEARNER = { id: 'user-1', email: 'student@email.com', roles: ['student'] };

function render() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<AuthScreen />);
  });
  return JSON.stringify(r.toJSON());
}

describe('AuthScreen — a session the server ended (OQ-52)', () => {
  beforeEach(() => mockUnsent.mockReset());

  it('says how much is still on the phone and whose account it waits for', () => {
    mockUnsent.mockReturnValue(6);
    authStore.setSignedOut(false, LEARNER);

    const text = render();

    expect(mockUnsent).toHaveBeenCalledWith('user-1');
    expect(text).toContain('auth.sessionEndedTitle');
    expect(text).toContain('auth.sessionEndedUnsent {\\"count\\":6,\\"email\\":\\"student@email.com\\"}');
    expect(text).toContain('login-form');
  });

  it('names no address it does not know', () => {
    mockUnsent.mockReturnValue(2);
    authStore.setSignedOut(false, { ...LEARNER, email: null });

    expect(render()).toContain('auth.sessionEndedUnsentNoEmail {\\"count\\":2}');
  });

  it('only says the session ended when nothing is waiting', () => {
    mockUnsent.mockReturnValue(0);
    authStore.setSignedOut(false, LEARNER);

    const text = render();
    expect(text).toContain('auth.sessionEndedBody');
    expect(text).not.toContain('sessionEndedUnsent');
  });

  it('shows no notice after a sign-out the learner chose', () => {
    mockUnsent.mockReturnValue(0);
    authStore.setSignedOut();

    const text = render();
    expect(text).not.toContain('sessionEnded');
    expect(text).toContain('login-form');
  });
});
