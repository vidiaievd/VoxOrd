import { apiClient } from './client';
import type { DifficultyLevel, ExerciseTemplateCode, LessonKind, LessonParagraph } from './types';

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
 * TEXT and AUDIO-kind fields are modeled (title, bodyMarkdown/paragraphs for
 * TEXT; mediaIds/transcript/listeningStages for AUDIO). VIDEO's `cues` and
 * LIVE's `live` block are still out of scope (no VIDEO/LIVE screen exists
 * yet).
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

/**
 * One step of an AUDIO-kind lesson's staged listening flow (Phase 7).
 * `stageType` is author-defined (e.g. `listen`, `gap_fill`, `comprehension`)
 * and not modeled as a closed enum here — mirrors how `templateCode` inside
 * `exercise` is server-open too. `exercise` is null for a pure listen-only
 * stage with no attached exercise.
 */
export interface ListeningStageExercise {
  id: string;
  templateCode: ExerciseTemplateCode;
  content: Record<string, unknown>;
  instructions: { language: string; text: string; hint: string | null }[];
}

export interface ListeningStage {
  position: number;
  stageType: string;
  exercise: ListeningStageExercise | null;
}

export interface LessonReaderContent {
  lessonId: string;
  kind: LessonKind;
  title: string;
  displayTitle: string | null;
  bodyMarkdown: string | null;
  /**
   * Media asset ids attached to the selected variant (`lesson_variant_media_ref`
   * rows), resolved via `GET /media/assets/:id` (see `src/api/media.ts`) —
   * confirmed against `get-lesson-reader-content.handler.ts`: for an
   * AUDIO-kind lesson this is where the narration track's id lives; it is NOT
   * embedded as a `[audio:id]` token in any field this DTO exposes (that
   * token only appears in the raw variant body the web authoring UI edits).
   */
  mediaIds: string[];
  paragraphs: LessonParagraph[] | null;
  /** Plain-text narration script, AUDIO-kind lessons only; null otherwise. */
  transcript: string | null;
  /** AUDIO-kind lessons only; null otherwise. */
  listeningStages: ListeningStage[] | null;
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

const LESSON_VARIANT_PATH = (lessonId: string, variantId: string) =>
  `/api/v1/lessons/${lessonId}/variants/${variantId}`;

/**
 * One variant of a lesson, fetched whole — plan 56 §3.8.
 *
 * Only the listening layer asks for this, and only for one thing: an exercise whose
 * clip is `source: 'lesson'` borrows the narration of a Read & Listen lesson **by
 * reference**, and the recording lives in the variant's body as an `[audio:id]` token.
 * `/reader` cannot answer it — that endpoint picks the variant it thinks best for the
 * learner, while the reference names the one the author chose.
 */
export interface LessonVariantContent {
  id: string;
  bodyMarkdown: string;
}

export function getLessonVariant(
  lessonId: string,
  variantId: string,
): Promise<LessonVariantContent> {
  return apiClient.get<LessonVariantContent>(LESSON_VARIANT_PATH(lessonId, variantId));
}
