import { getContainer } from '../api/courses';
import { getCourseHome } from '../api/courseHome';
import { getExerciseAnswers, getExerciseDisplay, getProbeHistory } from '../api/exercises';
import type { ProbeHistorySnapshot } from '../offline/engine/engine';
import { exerciseKeyCacheKey, type ExerciseKey } from '../offline/engine/grading';
import { getGrammarRuleExplanation, type GrammarRuleExplanation } from '../api/grammarRules';
import { getLessonReaderContent, type LessonReaderContent } from '../api/lessons';
import type { Container, CourseHomePayload, ExerciseDisplay, UnitContentsResult } from '../api/types';
import { getUnitContents } from '../api/unitContents';
import { getVocabularyListReader, type VocabularyListReaderContent } from '../api/vocabulary';

/**
 * What each course screen reads, as a cache key and the request behind it — shared by the
 * screens' hooks and the course download (offline plan, B3). The download writes its results
 * under the very keys the screens read, so a downloaded unit opens offline through the
 * screen's ordinary cache, with nothing for the screen to know about downloading.
 *
 * A key must change whenever the response would: a stale value under the right key is shown
 * as fresh until revalidated, one under the wrong key is never seen.
 */
export interface CourseResource<T> {
  key: string;
  load: () => Promise<T>;
}

/** Resolves a course container — the download passes one that asks once per course. */
export type ContainerSource = (courseId: string) => Promise<Container>;

/** The reader's content plus the course's language, which the reader response does not carry. */
export type LessonReaderData = LessonReaderContent & {
  /** Optional only for content cached before it was kept. */
  targetLanguage?: string;
};

export function courseHomeResource(courseId: string): CourseResource<CourseHomePayload> {
  return { key: `course-home:${courseId}`, load: () => getCourseHome(courseId) };
}

export function unitContentsResource(unitId: string): CourseResource<UnitContentsResult> {
  return { key: `unit-contents:${unitId}`, load: () => getUnitContents(unitId) };
}

/**
 * The reader asks for the course's CEFR level (from its container) alongside the UI language
 * as the student's native language — what the web reader gets from a student profile.
 */
export function lessonReaderResource(
  lessonId: string,
  courseId: string,
  uiLanguage: string,
  containerOf: ContainerSource = getContainer,
): CourseResource<LessonReaderData> {
  return {
    key: `lesson-reader:${lessonId}:${courseId}:${uiLanguage}`,
    load: async () => {
      const container = await containerOf(courseId);
      const content = await getLessonReaderContent(lessonId, {
        studentNativeLanguage: uiLanguage,
        studentCurrentLevel: container.difficultyLevel,
      });
      return { ...content, targetLanguage: container.targetLanguage };
    },
  };
}

export function grammarRuleResource(
  ruleId: string,
  courseId: string,
  uiLanguage: string,
  containerOf: ContainerSource = getContainer,
): CourseResource<GrammarRuleExplanation> {
  return {
    key: `grammar-rule-reader:${ruleId}:${courseId}:${uiLanguage}`,
    load: async () => {
      const container = await containerOf(courseId);
      return getGrammarRuleExplanation(ruleId, {
        studentNativeLanguage: uiLanguage,
        studentCurrentLevel: container.difficultyLevel,
      });
    },
  };
}

export function vocabularyListResource(
  listId: string,
  translationLanguage: string,
): CourseResource<VocabularyListReaderContent> {
  return {
    key: `vocab-reader:${listId}:${translationLanguage}`,
    load: () =>
      getVocabularyListReader(listId, {
        translationLanguage,
        includeExamples: true,
        examplesLimit: 3,
      }),
  };
}

export function exerciseDisplayResource(
  exerciseId: string,
  uiLanguage: string,
): CourseResource<ExerciseDisplay> {
  return {
    key: `exercise-display:${exerciseId}:${uiLanguage}`,
    load: () => getExerciseDisplay(exerciseId, uiLanguage),
  };
}

/**
 * The key of an exercise graded on the phone offline (`lib/offlineGrading`). Read by the
 * runner only when the server cannot grade; never shown.
 */
export function exerciseKeyResource(exerciseId: string): CourseResource<ExerciseKey> {
  return {
    key: exerciseKeyCacheKey(exerciseId),
    load: async () => {
      const answers = await getExerciseAnswers(exerciseId);
      return {
        templateCode: answers.templateCode,
        content: answers.content,
        expectedAnswers: answers.expectedAnswers,
        answerCheckSettings: answers.answerCheckSettings,
        instructions: answers.instructions,
      };
    },
  };
}

/**
 * The learner's `minimal_pairs` record for a `weakest` set (offline plan, B6), stamped with when
 * it was asked: the phone counts its own sittings only from then on, so none is counted twice.
 */
export function probeHistoryResource(exerciseId: string): CourseResource<ProbeHistorySnapshot> {
  return {
    key: `probe-history:${exerciseId}`,
    load: async () => {
      const fetchedAt = new Date().toISOString();
      const history = await getProbeHistory(exerciseId);
      return { fetchedAt, targetLanguage: history.targetLanguage, sittings: history.sittings };
    },
  };
}
