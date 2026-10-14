import type { Deck } from '../repositories/DeckRepository';

export type Tab = 'Home' | 'Courses' | 'Settings';

export type Screen =
  | { name: 'Home' }
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
  | { name: 'Courses' }
  | { name: 'CourseHome'; courseId: string }
  | { name: 'UnitContents'; unitId: string; courseId: string }
  | {
      name: 'LessonReader';
      lessonId: string;
      unitId: string;
      courseId: string;
      /** The exercises the text leads into, when it was opened from its unit. */
      exerciseIds?: string[];
    }
  | { name: 'VocabularyList'; listId: string; unitId: string; courseId: string }
  | { name: 'GrammarRuleReader'; ruleId: string; unitId: string; courseId: string }
  | { name: 'ReviewSession'; courseId?: string }
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
 * runner goes back to its unit, as the arrow there always did. `null` is the Home tab — the
 * one place Back may leave the app.
 */
export function backTarget(screen: Screen): Screen | null {
  switch (screen.name) {
    case 'Home':
      return null;
    case 'Courses':
    case 'Settings':
      return { name: 'Home' };
    case 'CourseHome':
      return { name: 'Courses' };
    case 'UnitContents':
      return { name: 'CourseHome', courseId: screen.courseId };
    case 'LessonReader':
    case 'VocabularyList':
    case 'GrammarRuleReader':
    case 'ExerciseRunner':
      return { name: 'UnitContents', unitId: screen.unitId, courseId: screen.courseId };
    case 'ReviewSession':
      return screen.courseId ? { name: 'CourseHome', courseId: screen.courseId } : { name: 'Home' };
    case 'Card':
      return { name: 'ModeSelector', deck: screen.deck };
    default:
      // The word-deck screens: every one of them went back to Home.
      return { name: 'Home' };
  }
}

/** The tab a screen belongs to, for the tab bar's highlight. */
export function tabOf(screen: Screen): Tab | null {
  if (screen.name === 'Home') return 'Home';
  if (screen.name === 'Settings') return 'Settings';
  if (
    screen.name === 'Courses' ||
    screen.name === 'CourseHome' ||
    screen.name === 'UnitContents' ||
    screen.name === 'LessonReader' ||
    screen.name === 'VocabularyList' ||
    screen.name === 'GrammarRuleReader' ||
    screen.name === 'ExerciseRunner'
  ) {
    return 'Courses';
  }
  return null;
}
