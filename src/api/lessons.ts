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
 * fetched separately; mobile uses the leaner single-call endpoint — `/reader`
 * already returns a fully-resolved `glossary` array (word + translation +
 * part of speech inline, no vocabulary-item id lookup needed), confirmed
 * against `get-lesson-reader-content.handler.ts`'s `resolveGlossary`. There is
 * no offset/span data anywhere in the backend for a glossary mark — matching
 * a mark to a word occurrence in `paragraph.target` has to be done
 * client-side by lemma text (see `src/utils/tokenizeGlossary.ts`), same
 * limitation the web reader has (inflected forms aren't recognized unless
 * they equal the stored lemma).
 *
 * Only the fields TEXT-kind lessons use are modeled for now (title,
 * bodyMarkdown, paragraphs, glossary). Video/audio/live fields exist on the
 * wire (`cues`, `transcript`, `listeningStages`, `live`) but are out of scope
 * until Phase 7.
 */
export interface ReaderGlossaryTranslation {
  language: string;
  text: string;
  definition: string | null;
}

export interface ReaderGlossaryEntry {
  /** Vocabulary item id, not the underlying glossary-mark id. */
  id: string;
  word: string;
  partOfSpeech: string | null;
  translation: ReaderGlossaryTranslation | null;
}

export interface LessonReaderContent {
  lessonId: string;
  kind: LessonKind;
  title: string;
  displayTitle: string | null;
  bodyMarkdown: string | null;
  paragraphs: LessonParagraph[] | null;
  glossary: ReaderGlossaryEntry[];
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
