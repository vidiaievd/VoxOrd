import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SoundSessionScreen } from './index';
import type { SoundSession } from '../../api/soundSession';

/**
 * What the pronunciation session puts on screen, per phase (platform plan 86, VoxOrd step 15.3).
 * The hook is the engine's walker and has its own tests; the microphone and the clip player are
 * the phone's and are stood in for here.
 */

let mockHook: Record<string, unknown>;
const mockStart = jest.fn();

jest.mock('../../hooks/useSoundSession', () => ({ useSoundSession: () => mockHook }));
jest.mock('./TakeButton', () => ({ TakeButton: () => null }));
jest.mock('./ClipButtons', () => ({ ClipButtons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars === undefined ? key : `${key} ${JSON.stringify(vars)}`,
    language: 'uk',
  }),
}));
jest.mock('../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
    typography: jest.requireActual('../../theme/typography').typography,
  }),
}));

const session = (over: Partial<SoundSession> = {}): SoundSession => ({
  attemptId: 'a1',
  resumed: false,
  language: 'nb',
  basis: 'chosen',
  phase: 'drill',
  doneReason: null,
  takes: 2,
  maxTakes: 40,
  takeIndex: 2,
  sounds: [{ atomId: 'nb:kj', family: 'kj', status: 'open' }],
  diagnostic: null,
  step: {
    phase: 'drill',
    atomId: 'nb:kj',
    family: 'kj',
    elementIndex: 0,
    element: { kind: 'word', word: 'kyss' },
    say: 'kyss',
    sentence: 'Nå sier jeg kyss igjen.',
    fails: 0,
  },
  ...over,
});

const hook = (over: Record<string, unknown> = {}) => ({
  phase: 'idle',
  session: null,
  budget: null,
  clips: [],
  instruction: null,
  take: null,
  notice: null,
  refusal: null,
  result: null,
  start: mockStart,
  sendTake: jest.fn(),
  next: jest.fn(),
  finish: jest.fn(),
  reload: jest.fn(),
  reset: jest.fn(),
  ...over,
});

function draw(element: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(element);
  });
  const text = tree.root
    .findAllByType(Text)
    .map(n => [n.props.children].flat(Infinity).join(''))
    .join('|');
  return { tree, text };
}

beforeEach(() => mockStart.mockReset());

describe('SoundSessionScreen', () => {
  it('offers the start, and starts the chosen sound', () => {
    mockHook = hook();
    const { text, tree } = draw(<SoundSessionScreen atomId="nb:kj" onBack={() => undefined} />);
    expect(text).toContain('soundSession.start.hint');
    expect(text).toContain('soundSession.start.chosen {"family":"kj"}');
    const button = tree.root.find(n => n.props.label === 'soundSession.start.trainSound {"family":"kj"}');
    act(() => button.props.onPress());
    expect(mockStart).toHaveBeenCalledWith('nb:kj');
  });

  it('says what the door refused in its own words', () => {
    mockHook = hook({ phase: 'refused', refusal: { status: 422, code: 'SESSION_LIMIT', retryAfterMs: null, takeIndex: null } });
    expect(draw(<SoundSessionScreen onBack={() => undefined} />).text).toContain('soundSession.refused.SESSION_LIMIT');
    mockHook = hook({ phase: 'refused', refusal: { status: 500, code: 'X', retryAfterMs: null, takeIndex: null } });
    expect(draw(<SoundSessionScreen onBack={() => undefined} />).text).toContain('soundSession.refused.generic');
  });

  it('draws a step: the target, the frame, progress and the notice', () => {
    mockHook = hook({ phase: 'step', session: session(), notice: 'inaudible' });
    const { text } = draw(<SoundSessionScreen onBack={() => undefined} />);
    expect(text).toContain('kyss');
    expect(text).toContain('Nå sier jeg kyss igjen.');
    expect(text).toContain('soundSession.progress.takes {"n":3,"max":40}');
    expect(text).toContain('[kj] · soundSession.status.open');
    expect(text).toContain('soundSession.notice.inaudible');
  });

  it('warns about a low budget only for a metered learner', () => {
    const budget = { payer: 'learner', metered: true, remainingCredits: 10, estimatedCredits: 35 };
    mockHook = hook({ phase: 'step', session: session(), budget });
    expect(draw(<SoundSessionScreen onBack={() => undefined} />).text).toContain('soundSession.start.lowBudget');
    mockHook = hook({ phase: 'step', session: session(), budget: { ...budget, payer: 'school' } });
    expect(draw(<SoundSessionScreen onBack={() => undefined} />).text).not.toContain('soundSession.start.lowBudget');
  });

  it('draws the verdict with the strongest event line and a way to the end', () => {
    mockHook = hook({
      phase: 'verdict',
      session: session({ phase: 'done', step: null }),
      take: {
        outcome: 'judged',
        reason: null,
        verdict: { measured: true, passed: false, key: 'KJ:major' },
        feedback: { summary: 'Close.', items: [{ explanation: 'Tongue higher.' }] },
        toneme: null,
        events: [{ kind: 'sound_failed', atomId: 'nb:kj' }],
        session: session(),
      },
    });
    const { text } = draw(<SoundSessionScreen onBack={() => undefined} />);
    expect(text).toContain('soundSession.verdict.missed');
    expect(text).toContain('Tongue higher.');
    expect(text).toContain('soundSession.events.sound_failed');
  });

  it('draws the ratings after the hand-in', () => {
    mockHook = hook({
      phase: 'result',
      session: session(),
      result: {
        score: 66.6,
        doneReason: 'finished',
        sounds: [{ atomId: 'nb:kj', status: 'passed', passes: 2, fails: 1, rating: 'HARD' }],
        diagnosticWeak: ['nb:y'],
        flagged: [],
      },
    });
    const { text } = draw(<SoundSessionScreen onBack={() => undefined} />);
    expect(text).toContain('soundSession.result.score {"score":67}');
    expect(text).toContain('soundSession.result.HARD');
    expect(text).toContain('[y]');
  });
});
