import type { UnitContentsItem, UnitContentsResult } from '../api/types';
import type { Screen } from '../navigation/screens';
import { itemsInOrder } from './nextItem';
import { exercisesForLesson, findSourceLessonId } from './sourceLesson';

export interface OpenContentPlace {
  unitId: string;
  courseId: string;
}

/**
 * The screen a unit's material opens on — one answer for the unit's rows, Today's «Continue»
 * and every other «Next» that names an item, so they never open the same thing two ways.
 *
 * - lesson: the reader, with the exercises the text leads into and whether it was read before;
 * - exercise: the runner over the unit's exercises as one set, at the item's place in it, with
 *   the unit's text lesson for the runners that link back to it (plan 54 Q5);
 * - word list and grammar rule: their own readers.
 *
 * Null for a container — a heading, nothing to open.
 */
export function openContentItem(
  item: UnitContentsItem,
  contents: UnitContentsResult,
  { unitId, courseId }: OpenContentPlace,
): Screen | null {
  switch (item.contentType) {
    case 'lesson':
      return {
        name: 'LessonReader',
        lessonId: item.contentId,
        unitId,
        courseId,
        exerciseIds: exercisesForLesson(contents, item.contentId),
        alreadyRead: item.status === 'completed',
      };
    case 'exercise': {
      const exerciseIds = itemsInOrder(contents)
        .filter((i) => i.contentType === 'exercise')
        .map((i) => i.contentId);
      const sourceLessonId = findSourceLessonId(contents);
      return {
        name: 'ExerciseRunner',
        exerciseIds,
        startIndex: Math.max(0, exerciseIds.indexOf(item.contentId)),
        unitId,
        courseId,
        ...(sourceLessonId === null ? {} : { sourceLessonId }),
      };
    }
    case 'vocabulary_list':
      return { name: 'VocabularyList', listId: item.contentId, unitId, courseId };
    case 'grammar_rule':
      return { name: 'GrammarRuleReader', ruleId: item.contentId, unitId, courseId };
    default:
      return null;
  }
}
