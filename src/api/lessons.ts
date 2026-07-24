import { apiClient } from './client';
import type { DifficultyLevel, LessonKind, LessonParagraph } from './types';

const LESSON_READER_PATH = (id: string) => `/api/v1/lessons/${id}/reader`;

export interface LessonReaderQuery {
  studentNativeLanguage: string;
  studentCurrentLevel: DifficultyLevel;
}

/**
 * `GET /lessons/:id/reader` (content-service) — a single kind-aware call
 * that resolves the best variant for the student server-side and returns
 * everything a reader screen needs in one round trip. Confirmed against
 * services/content-service/src/modules/lesson/presentation/controllers/
 * lesson.controller.ts (`LessonReaderContentResponseDto`).
 *
 * The web app instead composes `variants/best` + `variants/:id/paragraphs`
 * (2 calls) because its reader also needs the variant id for glossary marks
 * fetched separately; mobile uses the leaner single-call endpoint since
 * Step 3.1 has no glossary yet (Step 3.2 adds it — reconsider then if the
 * variant id turns out to be needed for that call too).
 *
 * Only the fields TEXT-kind lessons use are modeled for now (title,
 * bodyMarkdown, paragraphs). Video/audio/live fields exist on the wire
 * (`cues`, `transcript`, `listeningStages`, `live`) but are out of scope
 * until Phase 7.
 */
export interface LessonReaderContent {
  lessonId: string;
  kind: LessonKind;
  title: string;
  displayTitle: string | null;
  bodyMarkdown: string | null;
  paragraphs: LessonParagraph[] | null;
}

export async function getLessonReaderContent(
  lessonId: string,
  query: LessonReaderQuery,
): Promise<LessonReaderContent> {
  return apiClient.get<LessonReaderContent>(LESSON_READER_PATH(lessonId), {
    query: {
      studentNativeLanguage: query.studentNativeLanguage,
      studentCurrentLevel: query.studentCurrentLevel,
    },
  });
}
