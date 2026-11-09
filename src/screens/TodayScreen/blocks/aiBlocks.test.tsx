import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { contextKey, type AiUsage, type AssistContext } from '../../../api/assistant';
import type { MasteryProfile } from '../../../api/masteryProfile';
import type { MySubmissions, Submission } from '../../../api/submissions';
import { ThemeProvider } from '../../../providers/ThemeProvider';
import { creditsMeter } from '../blockLogic';
import { HOME_LAYOUT, layoutFor } from '../layout';
import { AiCredits } from './AiCredits';
import { AiReviewed } from './AiReviewed';
import { AssistPinned } from './AssistPinned';
import { AssistSuggestions } from './AssistSuggestions';

/*
 * Plan 03 step 4: variant D's blocks — 6b, D2, D3, D-pin — and D1's fallback.
 */

jest.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ theme: 'dark', uiLanguage: 'ru' }) }));
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ status: 'signedIn', user: { id: 'user-1' }, offline: false }),
}));

let mockOpen = new Set<string>();
jest.mock('../../../hooks/useAssistantAvailability', () => ({
  useAssistantAvailability: (context: AssistContext | null) => {
    const { contextKey: key } = jest.requireActual('../../../api/assistant');
    return { available: context !== null && mockOpen.has(key(context)), reason: null, refresh: async () => {} };
  },
}));

let mockCourse: unknown = null;
let mockUsage: AiUsage | null = null;
jest.mock('../../../hooks/useSwrResource', () => ({
  useSwrResource: (key: string | null) => {
    const data = key?.startsWith('ai-usage:') ? mockUsage : key ? mockCourse : null;
    return { status: 'loaded', data, error: null, refreshing: false, stale: false, refresh: async () => {} };
  },
}));

let mockSubmissions: MySubmissions | null = null;
jest.mock('../../../hooks/useMySubmissions', () => ({
  useMySubmissions: () => ({ status: 'loaded', submissions: mockSubmissions, stale: false, refresh: async () => {} }),
}));

let mockProfile: MasteryProfile | null = null;
jest.mock('../../../hooks/useMasteryProfile', () => ({
  useMasteryProfile: () => ({ profile: mockProfile, refresh: async () => {} }),
}));

function render(el: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ThemeProvider>{el}</ThemeProvider>);
  });
  return tree;
}

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string);

/** Presses the innermost press target holding `text`. */
const pressText = (tree: renderer.ReactTestRenderer, text: string) => {
  const holders = tree.root.findAll(
    (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length > 0,
  );
  act(() => holders[holders.length - 1].props.onPress());
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

function aiReviewed(over: Partial<Submission> = {}): Submission {
  return {
    attemptId: 'att-1',
    exerciseId: 'ex-1',
    templateCode: 'writing_task',
    title: 'Min familie',
    courseTitle: 'Norsk A2',
    containerId: 'course-1',
    unitId: 'unit-7',
    schoolId: null,
    submittedAt: hoursAgo(5),
    status: 'returned',
    attemptNo: 1,
    decision: {
      verdict: 'returned',
      by: 'ai',
      byUserId: null,
      byName: null,
      at: hoursAgo(4),
      comment: 'Tre feil i ordstilling etter «i går».',
      aiDrafted: false,
      acceptedAtTerm: false,
    },
    provisional: null,
    canResubmit: true,
    ...over,
  };
}

const page = (items: Submission[]): MySubmissions => ({ items, pendingCount: 0, pendingCapped: false });

beforeEach(() => {
  mockOpen = new Set();
  mockCourse = null;
  mockUsage = null;
  mockSubmissions = null;
  mockProfile = null;
});

describe('variant D layout', () => {
  it('puts Continue and Review where the plan for today would be', () => {
    expect(HOME_LAYOUT.solo_ai).toContain('aiPlan');
    expect(layoutFor('solo_ai', new Set(['aiPlan']))).toEqual([
      'offline',
      'header',
      'resume',
      'review',
      'aiReviewed',
      'assistSuggestions',
      'aiCredits',
    ]);
  });
});

describe('AiReviewed (block 6b)', () => {
  it('shows the model’s verdict, opens the review, and rewrites the exercise in its unit', () => {
    mockSubmissions = page([aiReviewed()]);
    const onNavigate = jest.fn();
    const tree = render(<AiReviewed onNavigate={onNavigate} />);

    expect(texts(tree)).toEqual(
      expect.arrayContaining(['Проверено ИИ', 'Min familie', 'Tre feil i ordstilling etter «i går».']),
    );
    pressText(tree, 'Открыть разбор');
    expect(onNavigate).toHaveBeenLastCalledWith({
      name: 'Submission',
      submissionId: 'att-1',
      exerciseId: 'ex-1',
      returnTo: { name: 'Today' },
    });
    pressText(tree, 'Переписать');
    expect(onNavigate).toHaveBeenLastCalledWith({
      name: 'ExerciseRunner',
      exerciseIds: ['ex-1'],
      startIndex: 0,
      unitId: 'unit-7',
      courseId: 'course-1',
    });
  });

  it('offers no rewrite on accepted work, or on older work that does not name its unit', () => {
    mockSubmissions = page([aiReviewed({ status: 'approved', canResubmit: false })]);
    expect(texts(render(<AiReviewed onNavigate={jest.fn()} />))).not.toContain('Переписать');

    mockSubmissions = page([aiReviewed({ unitId: null })]);
    const tree = render(<AiReviewed onNavigate={jest.fn()} />);
    expect(texts(tree)).toContain('Открыть разбор');
    expect(texts(tree)).not.toContain('Переписать');
  });

  it('leaves out a teacher’s review, a model’s word for a school, and anything older than two weeks', () => {
    const teacher = aiReviewed({
      decision: { ...aiReviewed().decision!, by: 'teacher', byUserId: 't-1' },
    });
    const school = aiReviewed({ schoolId: 'school-1' });
    const old = aiReviewed({ decision: { ...aiReviewed().decision!, at: hoursAgo(15 * 24) } });
    mockSubmissions = page([teacher, school, old]);
    expect(render(<AiReviewed onNavigate={jest.fn()} />).toJSON()).toBeNull();
  });
});

describe('AssistSuggestions (block D2)', () => {
  const free: AssistContext = { kind: 'free' };
  const unitCtx: AssistContext = { kind: 'unit', courseId: 'c1', unitId: 'u2' };
  const workCtx: AssistContext = { kind: 'submission', attemptId: 'att-1', exerciseId: 'ex-1' };

  beforeEach(() => {
    mockCourse = {
      units: [{ id: 'u2', position: 2, title: 'Leksjon 2', status: 'active', completedLessons: 1, totalLessons: 4 }],
    };
    mockSubmissions = page([aiReviewed()]);
    mockProfile = {
      weakest: [{ skill: 'written', focus: 'unknown', verdict: 'weak', confidence: 'medium' }],
    } as unknown as MasteryProfile;
  });

  it('is not drawn when the assistant takes no free question', () => {
    mockOpen.add(contextKey(unitCtx));
    expect(render(<AssistSuggestions courseId="c1" onNavigate={jest.fn()} />).toJSON()).toBeNull();
  });

  it('offers each prompt only where the server answers in its context, and sends it once', () => {
    mockOpen = new Set([contextKey(free), contextKey(workCtx)]);
    const onNavigate = jest.fn();
    const tree = render(<AssistSuggestions courseId="c1" onNavigate={onNavigate} />);
    const shown = texts(tree);

    expect(shown).not.toContain('Что главное в «Leksjon 2»?');
    expect(shown).toContain('Разбери мои ошибки в «Min familie»');
    pressText(tree, 'Разбери мои ошибки в «Min familie»');
    expect(onNavigate).toHaveBeenLastCalledWith({
      name: 'Assistant',
      context: workCtx,
      contextLabel: 'Min familie',
      prompt: 'Разбери мои ошибки в «Min familie»',
      returnTo: { name: 'Today' },
    });

    pressText(tree, 'Спросить помощника');
    expect(onNavigate).toHaveBeenLastCalledWith({ name: 'Assistant', context: free, returnTo: { name: 'Today' } });
  });

  it('asks about the unit «Continue» leads into', () => {
    mockOpen = new Set([contextKey(free), contextKey(unitCtx)]);
    const onNavigate = jest.fn();
    const tree = render(<AssistSuggestions courseId="c1" onNavigate={onNavigate} />);
    pressText(tree, 'Что главное в «Leksjon 2»?');
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ context: unitCtx, contextLabel: 'Leksjon 2', prompt: 'Что главное в «Leksjon 2»?' }),
    );
  });
});

describe('creditsMeter (block D3)', () => {
  it('is nothing for no answer, an unmetered plan or a zero limit', () => {
    expect(creditsMeter(null)).toBeNull();
    expect(creditsMeter({ used: '1.000000', total: null })).toBeNull();
    expect(creditsMeter({ used: '0.000000', total: '0.000000' })).toBeNull();
  });

  it('turns low at a tenth left, and stops the track at full past the limit', () => {
    expect(creditsMeter({ used: '179.900000', total: '200.000000' })?.low).toBe(false);
    expect(creditsMeter({ used: '180.000000', total: '200.000000' })?.low).toBe(true);
    expect(creditsMeter({ used: '201.500000', total: '200.000000' })).toEqual({
      used: 201.5,
      total: 200,
      fill: 1,
      low: true,
    });
  });
});

describe('AiCredits (block D3)', () => {
  it('says credits used of the period, with its end, and how to get more', () => {
    mockUsage = { feature: 'ai.review_direct', used: '3.418200', total: '200.000000', periodEnd: '2026-11-21T00:00:00Z' };
    const onMore = jest.fn();
    const tree = render(<AiCredits onMore={onMore} />);
    const line = texts(tree).find((s) => s.startsWith('ИИ-кредиты'));
    expect(line).toMatch(/^ИИ-кредиты: 3,4 из 200 · до /);
    pressText(tree, 'Как увеличить');
    expect(onMore).toHaveBeenCalled();
  });

  it('is hidden while unmetered', () => {
    mockUsage = { feature: 'ai.review_direct', used: '3.000000', total: null, periodEnd: '2026-11-21T00:00:00Z' };
    expect(render(<AiCredits onMore={jest.fn()} />).toJSON()).toBeNull();
  });
});

describe('AssistPinned (block D-pin)', () => {
  it('opens a free question, or straight into voice', () => {
    mockOpen.add(contextKey({ kind: 'free' }));
    const onNavigate = jest.fn();
    const tree = render(<AssistPinned offline={false} onNavigate={onNavigate} />);
    pressText(tree, 'Спросить помощника');
    expect(onNavigate).toHaveBeenLastCalledWith({
      name: 'Assistant',
      context: { kind: 'free' },
      returnTo: { name: 'Today' },
    });
    act(() => tree.root.findByProps({ accessibilityLabel: 'Спросить голосом' }).props.onPress());
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ startVoice: true }));
  });

  it('renders nothing offline, or where the server says no', () => {
    mockOpen.add(contextKey({ kind: 'free' }));
    expect(render(<AssistPinned offline onNavigate={jest.fn()} />).toJSON()).toBeNull();
    mockOpen = new Set();
    expect(render(<AssistPinned offline={false} onNavigate={jest.fn()} />).toJSON()).toBeNull();
  });
});
