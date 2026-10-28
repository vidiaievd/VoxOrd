import type { UnitContentsResult } from '../../api/types';
import { itemsInOrder } from '../../lib/nextItem';
import { exercisesForLesson, findSourceLessonId } from '../../lib/sourceLesson';
import type { Screen } from '../../navigation/screens';
import type { Resume } from './nextItem';

/**
 * Where «Continue» goes (Home spec §6.2, block 4). The exact material when it can be opened:
 * lesson, exercise (at its place in the unit's set), word list or rule. Otherwise the place
 * that shows what there is — the unit when its contents are out of reach, or when offline the
 * next step is not on the phone; the course when it is finished.
 */
export function resumeTarget(
  resume: Resume,
  courseId: string,
  contents: UnitContentsResult | null,
): Screen {
  if (resume.kind === 'courseDone') return { name: 'CourseHome', courseId };
  const unitId = resume.unit.id;
  const unitScreen: Screen = { name: 'UnitContents', unitId, courseId };
  if (resume.kind === 'unit' || !contents) return unitScreen;

  const { item, meta } = resume.next;
  if (meta.availability === 'needsNetwork') return unitScreen;

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
      return unitScreen;
  }
}
