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
/** A thread opened from Today — where a citation's screen goes back to. */
const thread: Screen = {
  name: 'Assistant',
  context: { kind: 'unit', ...unit },
  returnTo: { name: 'Today' },
};

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
  AppLanguage: [[{ name: 'AppLanguage' }, { name: 'Settings' }, 'Profile']],
  Account: [[{ name: 'Account' }, { name: 'Profile' }, 'Profile']],
  EditName: [[{ name: 'EditName' }, { name: 'Account' }, 'Profile']],
  DeleteAccount: [
    [{ name: 'DeleteAccount' }, { name: 'Account' }, 'Profile'],
  ],
  Subscription: [[{ name: 'Subscription' }, { name: 'Profile' }, 'Profile']],
  School: [
    [{ name: 'School', schoolId: 's1' }, { name: 'Profile' }, 'Profile'],
    [
      { name: 'School', schoolId: 's1', groupId: 'g1' },
      { name: 'Profile' },
      'Profile',
    ],
  ],
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
      {
        name: 'Submission',
        submissionId: 's1',
        exerciseId: 'e1',
        returnTo: { name: 'Today' },
      },
      { name: 'Today' },
      'Today',
    ],
  ],
  CourseHome: [
    [{ name: 'CourseHome', courseId: 'c1' }, { name: 'Courses' }, 'Courses'],
  ],
  CatalogCourse: [
    [
      { name: 'CatalogCourse', containerId: 'c1' },
      { name: 'Courses', segment: 'catalog' },
      'Courses',
    ],
  ],
  FindSchool: [
    [
      { name: 'FindSchool' },
      { name: 'Courses', segment: 'catalog' },
      'Courses',
    ],
    [
      { name: 'FindSchool', returnTo: { name: 'Today' } },
      { name: 'Today' },
      'Today',
    ],
  ],
  SchoolPublic: [
    [
      {
        name: 'SchoolPublic',
        slug: 'nordick',
        returnTo: { name: 'FindSchool', returnTo: { name: 'Today' } },
      },
      { name: 'FindSchool', returnTo: { name: 'Today' } },
      'Today',
    ],
  ],
  UnitContents: [
    [
      { name: 'UnitContents', ...unit },
      { name: 'CourseHome', courseId: 'c1' },
      'Courses',
    ],
    [{ name: 'UnitContents', ...unit, returnTo: thread }, thread, 'Today'],
  ],
  LessonReader: [
    [
      { name: 'LessonReader', lessonId: 'l1', ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
    [
      { name: 'LessonReader', lessonId: 'l1', ...unit, returnTo: thread },
      thread,
      'Today',
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
    [
      { name: 'GrammarRuleReader', ruleId: 'r1', ...unit, returnTo: thread },
      thread,
      'Today',
    ],
  ],
  ExerciseRunner: [
    [
      { name: 'ExerciseRunner', exerciseIds: ['e1'], startIndex: 0, ...unit },
      { name: 'UnitContents', ...unit },
      'Courses',
    ],
    [
      {
        name: 'ExerciseRunner',
        exerciseIds: ['e1'],
        startIndex: 0,
        ...unit,
        origin: 'practice',
      },
      { name: 'Practice' },
      'Practice',
    ],
  ],
  GrammarReview: [
    [
      { name: 'GrammarReview', ruleId: 'r1', ...unit },
      { name: 'Practice' },
      'Practice',
    ],
  ],
  ReviewSession: [
    [
      { name: 'ReviewSession', courseId: 'c1', from: 'CourseHome' },
      { name: 'CourseHome', courseId: 'c1' },
      'Courses',
    ],
    [{ name: 'ReviewSession', from: 'Today' }, { name: 'Today' }, 'Today'],
    [
      { name: 'ReviewSession', from: 'Practice' },
      { name: 'Practice' },
      'Practice',
    ],
    [{ name: 'ReviewSession' }, { name: 'Practice' }, 'Practice'],
  ],
  MyWords: [
    [{ name: 'MyWords' }, { name: 'Practice' }, 'Practice'],
    [{ name: 'MyWords', returnTo: thread }, thread, 'Today'],
  ],
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
    [{ name: 'Matching', deck }, { name: 'ModeSelector', deck }, 'Practice'],
  ],
  Quiz: [[{ name: 'Quiz', deck }, { name: 'ModeSelector', deck }, 'Practice']],
  Spelling: [
    [{ name: 'Spelling', deck }, { name: 'ModeSelector', deck }, 'Practice'],
  ],
  Listening: [
    [{ name: 'Listening', deck }, { name: 'ModeSelector', deck }, 'Practice'],
  ],
  Pronunciation: [
    [
      { name: 'Pronunciation', deck },
      { name: 'ModeSelector', deck },
      'Practice',
    ],
  ],
  Context: [
    [{ name: 'Context', deck }, { name: 'ModeSelector', deck }, 'Practice'],
  ],
  DeepSession: [
    [{ name: 'DeepSession', deck }, { name: 'ModeSelector', deck }, 'Practice'],
  ],
  SessionResults: [
    [
      { name: 'SessionResults', sessionId: 1, deck },
      { name: 'ModeSelector', deck },
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
    'GrammarReview',
    'Notifications',
    'Profile',
    'Settings',
    'AppLanguage',
    'Account',
    'EditName',
    'DeleteAccount',
    'Subscription',
    'School',
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
    expect(showsTabBar({ name: 'CatalogCourse', containerId: 'c1' })).toBe(
      false,
    );
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
