import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SchoolPausedScreen, useSchoolGate, useSchoolRefusal, type SchoolGateState } from './SchoolGate';
import { announceSchoolAccepted, announceSchoolRefusal } from '../../lib/schoolLifecycle';
import { ApiError } from '../../api/client';

const mockHome = jest.fn();
jest.mock('../../hooks/useCourseHome', () => ({ useCourseHome: () => mockHome() }));
jest.mock('../../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k, language: 'en' }) }));
jest.mock('../../providers/ThemeProvider', () => {
  const actual = jest.requireActual('../../theme/colors');
  const cardTitleMedium = { fontFamily: 'x' };
  return { useTheme: () => ({ colors: actual.lightColors, typography: { cardTitleMedium, secondary: {} } }) };
});
jest.mock('../../components/ui', () => ({
  Button: ({ label }: { label: string }) => label,
  Spinner: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

function gate(home: unknown): SchoolGateState {
  mockHome.mockReturnValue(home);
  let out!: SchoolGateState;
  function Probe() {
    out = useSchoolGate('c1');
    return null;
  }
  act(() => {
    ReactTestRenderer.create(<Probe />);
  });
  return out;
}
const loaded = (courseInfo: object) => ({ status: 'loaded', data: { courseInfo } });

describe('useSchoolGate', () => {
  it('lets an active school, a self-study course and a failed read through', () => {
    expect(gate(loaded({ schoolStatus: 'active' })).status).toBeNull();
    expect(gate(loaded({})).status).toBeNull();
    expect(gate({ status: 'error', data: null }).status).toBeNull();
    expect(gate({ status: 'error', data: null }).checking).toBe(false);
  });

  it('blocks a suspended, closed or purged school and carries the closing date', () => {
    expect(gate(loaded({ schoolStatus: 'suspended', schoolClosesAt: '2026-12-01' }))).toEqual({
      checking: false,
      status: 'suspended',
      closesAt: '2026-12-01',
    });
    expect(gate(loaded({ schoolStatus: 'closed' })).status).toBe('closed');
    expect(gate(loaded({ schoolStatus: 'purged' })).status).toBe('purged');
  });

  it('waits only while nothing is known', () => {
    expect(gate({ status: 'loading', data: null }).checking).toBe(true);
    expect(gate({ status: 'loading', data: { courseInfo: {} } }).checking).toBe(false);
  });
});

describe('SchoolPausedScreen', () => {
  it('shows the banner, the reason and the way back', () => {
    const onBack = jest.fn();
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(<SchoolPausedScreen status="suspended" closesAt={null} onBack={onBack} />);
    });
    expect(r.root.findByProps({ testID: 'school-status-banner' })).toBeTruthy();
    expect(JSON.stringify(r.toJSON())).toContain('schoolLifecycle.blockedStart');
    expect(JSON.stringify(r.toJSON())).toContain('schoolLifecycle.blockedBack');
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe('useSchoolRefusal', () => {
  const refused = () =>
    announceSchoolRefusal(
      Promise.reject(new ApiError({ message: 'school', status: 409, body: { code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' } })),
    ).catch(() => undefined);

  function mount(notify: jest.Mock) {
    const seen: Array<string | null> = [];
    function Probe() {
      seen.push(useSchoolRefusal(notify));
      return null;
    }
    act(() => {
      ReactTestRenderer.create(<Probe />);
    });
    return seen;
  }

  it('words a refusal once and keeps the banner until the server takes a start or hand-in', async () => {
    const notify = jest.fn();
    const seen = mount(notify);
    await act(async () => {
      await refused();
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('schoolSuspended');
    expect(seen.at(-1)).toBe('suspended');
    // The school was reactivated and the next start went through: the banner goes.
    act(() => announceSchoolAccepted());
    expect(seen.at(-1)).toBeNull();
  });
});
