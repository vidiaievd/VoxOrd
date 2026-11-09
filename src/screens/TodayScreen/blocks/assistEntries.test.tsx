import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { contextKey, type AssistContext } from '../../../api/assistant';
import { recordedSubmissions } from '../../../api/__fixtures__/submissionsRecorded';
import type { NextClass as NextClassData } from '../../../api/nextClass';
import { latestSchoolFeedback, parseSubmissionsPage, type MySubmissions } from '../../../api/submissions';
import { ThemeProvider } from '../../../providers/ThemeProvider';
import { AssistInline } from './AssistInline';
import { NextClass, classLabel } from './NextClass';
import { TeacherFeedback } from './TeacherFeedback';

/*
 * Plan 03 step 3: every entry to the assistant is drawn only when the server says the
 * assistant answers in that entry's own context — never off the learner's entitlements.
 */

jest.mock('../../../hooks/useSettings', () => ({ useSettings: () => ({ theme: 'dark', uiLanguage: 'ru' }) }));

/** Contexts the server says yes to, by key; every context asked about is recorded. */
let mockOpen = new Set<string>();
const mockAsked: (AssistContext | null)[] = [];
jest.mock('../../../hooks/useAssistantAvailability', () => ({
  useAssistantAvailability: (context: AssistContext | null) => {
    mockAsked.push(context);
    const { contextKey: key } = jest.requireActual('../../../api/assistant');
    return { available: context !== null && mockOpen.has(key(context)), reason: null, refresh: async () => {} };
  },
}));

let mockCourse: { status: string; data: unknown } = { status: 'loaded', data: null };
jest.mock('../../../hooks/useSwrResource', () => ({
  useSwrResource: (key: string | null) =>
    key ? { ...mockCourse, error: null, refreshing: false, stale: false, refresh: async () => {} } : { status: 'loading', data: null },
}));

let mockSubmissions: MySubmissions | null = null;
jest.mock('../../../hooks/useMySubmissions', () => ({
  useMySubmissions: () => ({ status: 'loaded', submissions: mockSubmissions, stale: false, refresh: async () => {} }),
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

/** Presses the innermost press target holding `text` — a link inside a pressable card, as a touch would. */
const pressText = (tree: renderer.ReactTestRenderer, text: string) => {
  const holders = tree.root.findAll(
    (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length > 0,
  );
  const node = holders[holders.length - 1];
  act(() => node.props.onPress());
};

const units = [
  { id: 'u1', position: 1, title: 'Leksjon 1', status: 'done', completedLessons: 3, totalLessons: 3 },
  { id: 'u2', position: 2, title: 'Leksjon 2', status: 'active', completedLessons: 1, totalLessons: 4 },
];

beforeEach(() => {
  mockOpen = new Set();
  mockAsked.length = 0;
  mockCourse = { status: 'loaded', data: { units } };
});

describe('AssistInline (block 2)', () => {
  const unitCtx: AssistContext = { kind: 'unit', courseId: 'c1', unitId: 'u2' };

  it('asks about the unit «Continue» leads into, and opens there', () => {
    mockOpen.add(contextKey(unitCtx));
    const onNavigate = jest.fn();
    const tree = render(<AssistInline courseId="c1" onNavigate={onNavigate} />);

    expect(texts(tree)).toContain('Спросить про Leksjon 2');
    pressText(tree, 'Спросить про Leksjon 2');
    expect(onNavigate).toHaveBeenLastCalledWith({
      name: 'Assistant',
      context: unitCtx,
      contextLabel: 'Leksjon 2',
      returnTo: { name: 'Today' },
    });

    act(() => tree.root.findByProps({ accessibilityLabel: 'Спросить голосом' }).props.onPress());
    expect(onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({ context: unitCtx, startVoice: true }));
  });

  it('draws nothing where the server says no, though the learner may have the key', () => {
    expect(render(<AssistInline courseId="c1" onNavigate={jest.fn()} />).toJSON()).toBeNull();
    expect(mockAsked).toContainEqual(unitCtx);
  });

  it('offers a free question without a course', () => {
    mockOpen.add(contextKey({ kind: 'free' }));
    const tree = render(<AssistInline courseId={null} onNavigate={jest.fn()} />);
    expect(texts(tree)).toContain('Спросить помощника');
  });

  it('waits for the course instead of offering a free question first', () => {
    mockOpen.add(contextKey({ kind: 'free' }));
    mockCourse = { status: 'loading', data: null };
    expect(render(<AssistInline courseId="c1" onNavigate={jest.fn()} />).toJSON()).toBeNull();
    expect(mockAsked.every((c) => c === null)).toBe(true);
  });
});

describe('TeacherFeedback (block 6)', () => {
  const items = () => parseSubmissionsPage(recordedSubmissions.mine)!;
  const discuss = 'Разобрать ошибки с помощником';

  it('offers to go over the latest review, in C, when the server says yes', () => {
    mockSubmissions = { items: items(), pendingCount: 0, pendingCapped: false };
    const latest = latestSchoolFeedback(mockSubmissions.items)!;
    const ctx: AssistContext = { kind: 'submission', attemptId: latest.attemptId, exerciseId: latest.exerciseId };
    mockOpen.add(contextKey(ctx));
    const onNavigate = jest.fn();

    const tree = render(<TeacherFeedback offline={false} offerAssist onNavigate={onNavigate} />);
    pressText(tree, discuss);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Assistant', context: ctx, returnTo: { name: 'Today' } }),
    );
  });

  it('has no link outside C, nor where the server says no', () => {
    mockSubmissions = { items: items(), pendingCount: 0, pendingCapped: false };
    expect(texts(render(<TeacherFeedback offline={false} offerAssist onNavigate={jest.fn()} />))).not.toContain(discuss);
    const latest = latestSchoolFeedback(mockSubmissions.items)!;
    mockOpen.add(contextKey({ kind: 'submission', attemptId: latest.attemptId, exerciseId: latest.exerciseId }));
    expect(texts(render(<TeacherFeedback offline={false} onNavigate={jest.fn()} />))).not.toContain(discuss);
  });
});

describe('NextClass (block 7)', () => {
  const nextClass: NextClassData = {
    lessonId: 'cls-1',
    date: '2026-10-30',
    startTime: '18:00',
    endTime: '19:30',
    room: null,
    status: 'scheduled',
    schoolId: 's1',
    schoolName: 'Nordick',
    groupId: 'g1',
    groupName: 'A2 kveld',
    teacher: null,
  };
  const prepare = 'Подготовиться с помощником';

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-28T12:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  it('offers to prepare for the class, named by its day and time', () => {
    mockOpen.add(contextKey({ kind: 'class', lessonId: 'cls-1' }));
    const onNavigate = jest.fn();
    const tree = render(<NextClass nextClass={nextClass} offerAssist onNavigate={onNavigate} />);
    pressText(tree, prepare);
    expect(onNavigate).toHaveBeenCalledWith({
      name: 'Assistant',
      context: { kind: 'class', lessonId: 'cls-1' },
      contextLabel: '30.10 · 18:00',
      returnTo: { name: 'Today' },
    });
  });

  it('has no link where the server says no, or outside C', () => {
    expect(texts(render(<NextClass nextClass={nextClass} offerAssist onNavigate={jest.fn()} />))).not.toContain(prepare);
    mockOpen.add(contextKey({ kind: 'class', lessonId: 'cls-1' }));
    expect(texts(render(<NextClass nextClass={nextClass} onNavigate={jest.fn()} />))).not.toContain(prepare);
  });

  it('labels a class by day.month · start', () => {
    expect(classLabel({ date: '2026-01-05', startTime: '09:15' })).toBe('05.01 · 09:15');
  });
});
