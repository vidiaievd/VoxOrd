import type { Deck } from '../repositories/DeckRepository';
import {
  TABS,
  TAB_ROOT,
  backTarget,
  showsTabBar,
  tabOf,
  type Screen,
  type Tab,
} from './screens';

const deck = { id: 7 } as Deck;
const unit = { unitId: 'u1', courseId: 'c1' };

/**
 * Every screen once, with where Back leads and which tab it lights. Typed by name so a new
 * screen fails to compile here until it is given both.
 */
const CASES: {
  [N in Screen['name']]: [Extract<Screen, { name: N }>, Screen | null, Tab][];
} = {
  Today: [[{ name: 'Today' }, null, 'Today']],
  Courses: [[{ name: 'Courses' }, { name: 'Today' }, 'Courses']],
  Practice: [[{ name: 'Practice' }, { name: 'Today' }, 'Practice']],
  Notifications: [
    [{ name: 'Notifications' }, { name: 'Today' }, 'Notifications'],
  ],
  Profile: [[{ name: 'Profile' }, { name: 'Today' }, 'Profile']],
  Settings: [[{ name: 'Settings' }, { name: 'Profile' }, 'Profile']],
  Assistant: [
    [
      { name: 'Assistant', returnTo: { name: 'Today' } },
      { name: 'Today' },
      'Today',
    ],
    [
      {
        name: 'Assistant',
        context: { kind: 'unit', ...unit },
        startVoice: true,
        returnTo: { name: 'UnitContents', ...unit },
      },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
  ],
  Submission: [
    [
      { name: 'Submission', submissionId: 's1', exerciseId: 'e1' },
      { name: 'Notifications' },
      'Notifications',
    ],
    [
      { name: 'Submission', submissionId: 's1', exerciseId: 'e1', returnTo: { name: 'Today' } },
      { name: 'Today' },
      'Today',
    ],
  ],
  CourseHome: [
    [{ name: 'CourseHome', courseId: 'c1' }, { name: 'Courses' }, 'Courses'],
  ],
  UnitContents: [
    [
      { name: 'UnitContents', ...unit },
      { name: 'CourseHome', courseId: 'c1' },
      'Courses',
    ],
  ],
  LessonReader: [
    [
      { name: 'LessonReader', lessonId: 'l1', ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
  ],
  VocabularyList: [
    [
      { name: 'VocabularyList', listId: 'v1', ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
  ],
  GrammarRuleReader: [
    [
      { name: 'GrammarRuleReader', ruleId: 'r1', ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
  ],
  ExerciseRunner: [
    [
      { name: 'ExerciseRunner', exerciseIds: ['e1'], startIndex: 0, ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
  ],
  ReviewSession: [
    [
      { name: 'ReviewSession', courseId: 'c1' },
      { name: 'CourseHome', courseId: 'c1' },
      'Courses',
    ],
    [{ name: 'ReviewSession' }, { name: 'Practice' }, 'Practice'],
  ],
  MyWords: [[{ name: 'MyWords' }, { name: 'Practice' }, 'Practice']],
  ModeSelector: [
    [{ name: 'ModeSelector', deck }, { name: 'Practice' }, 'Practice'],
  ],
  Card: [
    [{ name: 'Card', deck }, { name: 'ModeSelector', deck }, 'Practice'],
    [
      { name: 'Card', deck, mode: 'assessment' },
      { name: 'ModeSelector', deck },
      'Practice',
    ],
  ],
  Matching: [
    [{ name: 'Matching', deckId: 7 }, { name: 'Practice' }, 'Practice'],
  ],
  Quiz: [[{ name: 'Quiz', deckId: 7 }, { name: 'Practice' }, 'Practice']],
  Spelling: [
    [{ name: 'Spelling', deckId: 7 }, { name: 'Practice' }, 'Practice'],
  ],
  Listening: [
    [{ name: 'Listening', deckId: 7 }, { name: 'Practice' }, 'Practice'],
  ],
  Pronunciation: [
    [{ name: 'Pronunciation', deckId: 7 }, { name: 'Practice' }, 'Practice'],
  ],
  Context: [[{ name: 'Context', deckId: 7 }, { name: 'Practice' }, 'Practice']],
  DeepSession: [
    [{ name: 'DeepSession', deck }, { name: 'Practice' }, 'Practice'],
  ],
  SessionResults: [
    [
      { name: 'SessionResults', sessionId: 1, deckId: 7 },
      { name: 'Practice' },
      'Practice',
    ],
  ],
};

const all = Object.values(CASES).flat() as [Screen, Screen | null, Tab][];

describe.each(all)('%j', (screen, back, tab) => {
  it('goes back to the right place', () => {
    expect(backTarget(screen)).toEqual(back);
  });

  it('lights the right tab', () => {
    expect(tabOf(screen)).toBe(tab);
  });
});

describe('the way back', () => {
  it('leaves the app only from Today', () => {
    expect(
      all
        .filter(([screen]) => backTarget(screen) === null)
        .map(([s]) => s.name),
    ).toEqual(['Today']);
  });

  it('reaches Today from every screen', () => {
    for (const [start] of all) {
      let screen: Screen | null = start;
      for (let hops = 0; hops < 10 && screen.name !== 'Today'; hops++) {
        screen = backTarget(screen);
        if (screen === null) break;
      }
      expect(screen).toEqual({ name: 'Today' });
    }
  });

  it('never moves the highlight to another tab, except from a tab root to Today', () => {
    const roots = ['Today', 'Courses', 'Practice', 'Notifications', 'Profile'];
    for (const [screen, back] of all) {
      if (back === null || roots.includes(screen.name)) continue;
      expect(tabOf(back)).toBe(tabOf(screen));
    }
  });
});

describe('showsTabBar', () => {
  const withBar = [
    'Today',
    'Courses',
    'CourseHome',
    'Practice',
    'ModeSelector',
    'MyWords',
    'Notifications',
    'Profile',
    'Settings',
  ];

  it('shows the bar on tab roots and their lists, and nowhere else', () => {
    for (const [screen] of all) {
      expect([screen.name, showsTabBar(screen)]).toEqual([
        screen.name,
        withBar.includes(screen.name),
      ]);
    }
  });

  it('opens a unit, a lesson, a session and the assistant full-screen', () => {
    expect(showsTabBar({ name: 'UnitContents', ...unit })).toBe(false);
    expect(
      showsTabBar({
        name: 'ExerciseRunner',
        exerciseIds: [],
        startIndex: 0,
        ...unit,
      }),
    ).toBe(false);
    expect(showsTabBar({ name: 'ReviewSession' })).toBe(false);
    expect(
      showsTabBar({ name: 'Assistant', returnTo: { name: 'Today' } }),
    ).toBe(false);
  });
});

describe('TAB_ROOT', () => {
  it('opens every tab on a screen of that tab', () => {
    for (const tab of TABS) expect(tabOf(TAB_ROOT[tab])).toBe(tab);
  });
});
