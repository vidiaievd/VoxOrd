import type { AssistContext } from '../api/assistant';
import type { Deck } from '../repositories/DeckRepository';

export type Tab =
  | 'Today'
  | 'Courses'
  | 'Practice'
  | 'Notifications'
  | 'Profile';

/**
 * What the assistant is opened about (Home spec §6.2) — the context the server reads the
 * course, the payer and the material from (`src/api/assistant.ts`, platform plan 83 §3).
 * Without one, the question is free.
 */
export type AssistantContext = AssistContext;

export type Screen =
  | { name: 'Today' }
  | { name: 'Practice' }
  | { name: 'Notifications' }
  | { name: 'Profile' }
  | {
      name: 'Assistant';
      context?: AssistantContext;
      /**
       * What the context chip reads — «{unit} · {title}», a work's title, a class's date. The
       * opener knows it; the context carries only ids.
       */
      contextLabel?: string;
      /** Open straight into voice input — the microphone beside the inline prompt. */
      startVoice?: boolean;
      /** Sent once as the first message. */
      prompt?: string;
      /** The screen it was opened over — the assistant belongs to no tab of its own. */
      returnTo: Screen;
    }
  | {
      name: 'Submission';
      submissionId: string;
      /** The AI review is addressed by exercise and attempt both (`src/api/aiReview.ts`). */
      exerciseId: string;
      /**
       * Opened from Today rather than from a notification: Back returns there instead of
       * jumping to the Notifications tab (owner's decision 2026-10-25, against Home §4.2).
       */
      returnTo?: Screen;
    }
  | { name: 'ModeSelector'; deck: Deck }
  | { name: 'Card'; deck: Deck; mode?: 'assessment' }
  | { name: 'Matching'; deckId: number }
  | { name: 'Quiz'; deckId: number }
  | { name: 'Spelling'; deckId: number }
  | { name: 'Listening'; deckId: number }
  | { name: 'Pronunciation'; deckId: number }
  | { name: 'Context'; deckId: number }
  | { name: 'DeepSession'; deck: Deck }
  | { name: 'SessionResults'; sessionId: number; deckId: number }
  | { name: 'Courses'; segment?: 'mine' | 'catalog' }
  /** A course in the catalogue, before enrolment (Courses spec 5c). */
  | { name: 'CatalogCourse'; containerId: string }
  /** Schools with a public page (plan 04 step 9c); Back returns to where it was opened. */
  | { name: 'FindSchool'; returnTo?: Screen }
  /** A school's public page with the application; Back returns to the list it came from. */
  | { name: 'SchoolPublic'; slug: string; returnTo: Screen }
  | { name: 'CourseHome'; courseId: string }
  | {
      name: 'UnitContents';
      unitId: string;
      courseId: string;
      /** Opened from an assistant's citation: Back goes back to the thread. */
      returnTo?: Screen;
    }
  | {
      name: 'LessonReader';
      lessonId: string;
      unitId: string;
      courseId: string;
      /** The exercises the text leads into, when it was opened from its unit. */
      exerciseIds?: string[];
      /** Marked read before — the button to go on is then pinned rather than at the end. */
      alreadyRead?: boolean;
      /** Opened from an assistant's citation: Back goes back to the thread. */
      returnTo?: Screen;
    }
  | { name: 'VocabularyList'; listId: string; unitId: string; courseId: string }
  | {
      name: 'GrammarRuleReader';
      ruleId: string;
      unitId: string;
      courseId: string;
      /** Opened from an assistant's citation: Back goes back to the thread. */
      returnTo?: Screen;
    }
  | { name: 'ReviewSession'; courseId?: string }
  | {
      name: 'MyWords';
      /** Opened from an assistant's citation of a personal word: Back goes back to the thread. */
      returnTo?: Screen;
    }
  | {
      name: 'ExerciseRunner';
      exerciseIds: string[];
      startIndex: number;
      unitId: string;
      courseId: string;
      /**
       * The unit's own text lesson, when it has one — what `multiple_choice_group`'s «To
       * the text» opens (plan 54 Q5). Carried on the route because the unit screen is
       * where it is known; the runner is handed a set of exercise ids and nothing else.
       */
      sourceLessonId?: string;
    }
  | { name: 'Settings' };

/**
 * Where «Back» leads from each screen — the on-screen arrow and the phone's own Back button
 * alike, so the two never disagree.
 *
 * The navigator holds one screen rather than a history, and the way back is the screen's
 * place in the app rather than the path that reached it: a lesson opened from the exercise
 * runner goes back to its unit, as the arrow there always did. The root of every tab goes
 * back to Today, and `null` is Today itself — the one place Back may leave the app. The
 * assistant is the exception: it sits over whatever opened it and goes back there — and so
 * does the course screen one of its citations opened, back to the thread.
 */
export function backTarget(screen: Screen): Screen | null {
  switch (screen.name) {
    case 'Today':
      return null;
    case 'Courses':
    case 'Practice':
    case 'Notifications':
    case 'Profile':
      return { name: 'Today' };
    case 'Assistant':
      return screen.returnTo;
    case 'Submission':
      return screen.returnTo ?? { name: 'Notifications' };
    case 'Settings':
      return { name: 'Profile' };
    case 'CourseHome':
      return { name: 'Courses' };
    case 'CatalogCourse':
      return { name: 'Courses', segment: 'catalog' };
    case 'FindSchool':
      return screen.returnTo ?? { name: 'Courses', segment: 'catalog' };
    case 'SchoolPublic':
      return screen.returnTo;
    case 'UnitContents':
      return screen.returnTo ?? { name: 'CourseHome', courseId: screen.courseId };
    case 'LessonReader':
    case 'GrammarRuleReader':
      if (screen.returnTo) return screen.returnTo;
      return {
        name: 'UnitContents',
        unitId: screen.unitId,
        courseId: screen.courseId,
      };
    case 'VocabularyList':
    case 'ExerciseRunner':
      return {
        name: 'UnitContents',
        unitId: screen.unitId,
        courseId: screen.courseId,
      };
    case 'ReviewSession':
      return screen.courseId
        ? { name: 'CourseHome', courseId: screen.courseId }
        : { name: 'Practice' };
    case 'Card':
      return { name: 'ModeSelector', deck: screen.deck };
    case 'MyWords':
      return screen.returnTo ?? { name: 'Practice' };
    case 'ModeSelector':
    case 'Matching':
    case 'Quiz':
    case 'Spelling':
    case 'Listening':
    case 'Pronunciation':
    case 'Context':
    case 'DeepSession':
    case 'SessionResults':
      // The word decks. The modes carry only a deck id, so they cannot go back to their
      // ModeSelector yet — plan 05 puts the deck on the route.
      return { name: 'Practice' };
  }
}

/** The screen each tab opens on, and goes back to when it is tapped again. */
export const TAB_ROOT: Record<Tab, Screen> = {
  Today: { name: 'Today' },
  Courses: { name: 'Courses' },
  Practice: { name: 'Practice' },
  Notifications: { name: 'Notifications' },
  Profile: { name: 'Profile' },
};

export const TABS = Object.keys(TAB_ROOT) as Tab[];

/**
 * The tab a screen belongs to, for the tab bar's highlight: a tab's root is its own, and
 * every other screen belongs where its Back leads — so going back never moves the highlight
 * to another tab. A review started from a course is the course's; one started anywhere else
 * is Practice's.
 */
export function tabOf(screen: Screen): Tab {
  for (const tab of TABS) {
    if (TAB_ROOT[tab].name === screen.name) return tab;
  }
  const target = backTarget(screen);
  // Only Today goes back to nothing, and Today is a root.
  return target === null ? 'Today' : tabOf(target);
}

/**
 * The screens that show the tab bar — a list of those that do rather than those that do not,
 * so a new screen opens full-screen until someone decides otherwise. A course's home and a
 * deck's mode list keep the bar (Courses §4.1, Practice §4.1); a unit and everything opened
 * from it, a lesson, a review, a session and the assistant take the whole screen.
 */
const WITH_TAB_BAR: ReadonlySet<Screen['name']> = new Set<Screen['name']>([
  'Today',
  'Courses',
  'CourseHome',
  'Practice',
  'ModeSelector',
  'MyWords',
  'Notifications',
  'Profile',
  'Settings',
]);

export function showsTabBar(screen: Screen): boolean {
  return WITH_TAB_BAR.has(screen.name);
}
