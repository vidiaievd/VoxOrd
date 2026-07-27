/**
 * Platform types consumed by the mobile course-integration feature.
 *
 * These are hand-copied (not imported) from ssz-platform-web and
 * ssz-platform, one time, at planning time (2026-07-19) — see each section's
 * source-path comment. Copies drift from the source over time; re-verify the
 * shape against the source file before relying on a field in a new phase
 * (Ground rule 5 in docs/plans/course-integration-plan.md).
 */

/* ─────────────────────────────────────────────────────────────────────────
 * Content — containers, lessons, exercises
 * Source: ssz-platform-web/src/features/content/types/index.ts
 * ────────────────────────────────────────────────────────────────────── */

export type ContainerType = 'course' | 'module' | 'collection';
export type DifficultyLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type Visibility = 'public' | 'school_private' | 'shared' | 'private';

export interface Container {
  id: string;
  slug: string | null;
  title: string;
  description?: string | null;
  containerType: ContainerType;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  visibility: Visibility;
  gatingMode?: 'open' | 'sequential';
  currentPublishedVersionId?: string | null;
  lessonCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type ContainerItemType =
  | 'container'
  | 'lesson'
  | 'vocabulary_list'
  | 'grammar_rule'
  | 'exercise';

export interface ContainerItem {
  id: string;
  containerVersionId: string;
  position: number;
  itemType: ContainerItemType;
  itemId: string;
  isRequired: boolean;
  sectionId?: string | null;
  title: string | null;
  addedAt: string;
}

export interface ContainerSection {
  id: string;
  containerVersionId: string;
  title: string;
  position: number;
  createdAt: string;
}

export type LessonKind = 'text' | 'video' | 'audio' | 'live';

export interface Lesson {
  id: string;
  slug: string | null;
  title: string;
  description?: string | null;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  kind: LessonKind;
  createdAt: string;
  updatedAt: string;
}

export interface LessonVariant {
  id: string;
  lessonId: string;
  explanationLanguage: string;
  minLevel: DifficultyLevel;
  maxLevel: DifficultyLevel;
  displayTitle: string;
  displayDescription?: string | null;
  bodyMarkdown: string;
  estimatedReadingMinutes?: number | null;
  status: 'draft' | 'published';
  /** Full transcript of the listening track. AUDIO-kind lessons only. */
  transcript?: string | null;
}

/** Paragraph-aligned bilingual translation for TEXT lesson variants. */
export interface LessonParagraph {
  target: string;
  translation: string | null;
}

/** Ordered transcript cue for a VIDEO lesson variant. Phase 7 (out of MVP scope). */
export interface LessonVideoCue {
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine: string | null;
}

export type ListeningStageType = 'gap_fill' | 'comprehension';

/** Ordered gap-fill/comprehension activity staged after an AUDIO variant's transcript. */
export interface LessonListeningStage {
  exerciseId: string;
  position: number;
  stageType: ListeningStageType;
}

/** Author-marked glossary word for a TEXT/VIDEO lesson variant. */
export interface GlossaryMark {
  id: string;
  vocabularyItemId: string;
  occurrenceCount: number;
}

export interface VocabularyTranslation {
  languageCode: string;
  translation: string;
  definition?: string;
}

export interface VocabularyExample {
  id: string;
  template: string;
  substitution?: string;
  translations?: Record<string, string>;
}

export interface VocabularyForm {
  label: string;
  value: string;
}

export interface VocabularyItem {
  id: string;
  lemma: string;
  partOfSpeech?: string;
  ipa?: string;
  translations: VocabularyTranslation[];
  examples: VocabularyExample[];
  forms?: VocabularyForm[];
  audioMediaId?: string;
}

export interface VocabularyList {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  targetLanguage: string;
  itemCount?: number;
  createdAt: string;
}

/**
 * Exercise template codes mirror content-service's seeded templates exactly.
 * Source: ssz-platform-web/src/features/content-authoring/schemas/exercise.ts
 * (`EXERCISE_TYPES`). All 8 exist server-side; VoxOrd implements them
 * incrementally per Phase 4 steps 4.2–4.5.
 */
export type ExerciseTemplateCode =
  | 'multiple_choice'
  | 'fill_in_blank'
  | 'translate_to_target'
  | 'translate_from_target'
  | 'match_pairs'
  | 'short_answer'
  | 'writing_task'
  | 'sentence_schema';

export interface ExerciseInstruction {
  id: string;
  exerciseId: string;
  instructionLanguage: string;
  instructionText: string;
  hintText: string | null;
}

/**
 * Exercise as returned by `GET /exercises/:id/display` — content only,
 * answers omitted. `content` shape depends on `templateCode`; the concrete
 * per-template fields are defined in Phase 4 next to the body components
 * that consume them (not here), following exercise-page.tsx's approach of
 * casting `content` per template rather than a shared discriminated union.
 */
export interface ExerciseDisplay {
  id: string;
  exerciseTemplateId?: string;
  templateCode: ExerciseTemplateCode;
  targetLanguage: string;
  difficultyLevel?: DifficultyLevel;
  content: Record<string, unknown>;
  instructions?: ExerciseInstruction[] | null;
}

/* ─────────────────────────────────────────────────────────────────────────
 * Learning — enrollments, progress, mastery, can-do, unit contents
 * Source: ssz-platform-web/src/features/learning/types.ts and
 * ssz-platform/services/learning-service/src/modules/enrollments/presentation/dto/enrollment.response.ts
 * ────────────────────────────────────────────────────────────────────── */

export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'UNENROLLED';

export interface Enrollment {
  id: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt: string | null;
  unenrolledAt: string | null;
  unenrollReason: string | null;
}

export type LessonProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface LessonProgress {
  lessonId: string;
  moduleId: string;
  status: LessonProgressStatus;
  score?: number;
  completedAt?: string;
}

export interface ModuleProgress {
  moduleId: string;
  status: LessonProgressStatus;
  completedLessons: number;
  totalLessons: number;
}

export interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  modules: ModuleProgress[];
  lessons: LessonProgress[];
}

/** POST body for `POST /progress` (record an attempt / upsert progress). */
export interface UpsertProgressRequest {
  contentType: string;
  contentId: string;
  timeSpentSeconds: number;
  score?: number;
  completed: boolean;
}

export interface ProgressRecord {
  id: string;
  userId: string;
  contentRef: { type: string; id: string };
  status: string;
  attemptsCount: number;
  lastAttemptAt: string | null;
  timeSpentSeconds: number;
  score: number | null;
  completedAt: string | null;
  needsReviewSince: string | null;
  reviewResolvedAt: string | null;
}

export interface SkillMastery {
  skill: string;
  masteryPercent: number;
}

export interface CourseMastery {
  courseId: string;
  overallMastery: number;
  bySkill: SkillMastery[];
}

export type CanDoState = 'locked' | 'in-progress' | 'unlocked';

export interface CanDoItem {
  id: string;
  descriptor: string;
  cefrLevel?: string;
  moduleId: string;
  evidenceCount: number;
  unlockedAt?: string;
  state: CanDoState;
}

export interface CanDoResponse {
  items: CanDoItem[];
}

export type UnitContentsItemStatus = 'locked' | 'available' | 'in_progress' | 'completed';

/**
 * Normalized (lowercase) content type used across the app's UI layer.
 * The wire value from learning-service is UPPERCASE — see
 * `normalizeContentType` in `unitContents.ts`, which converts at the boundary.
 */
export type UnitContentsItemType =
  | 'container'
  | 'lesson'
  | 'vocabulary_list'
  | 'grammar_rule'
  | 'exercise';

export interface UnitContentsItem {
  id: string;
  contentType: UnitContentsItemType;
  contentId: string;
  title: string | null;
  lessonKind: string | null;
  durationMinutes: number | null;
  xpReward: number | null;
  status: UnitContentsItemStatus;
}

export interface UnitContentsSection {
  id: string;
  title: string;
  items: UnitContentsItem[];
}

export interface UnitContentsResult {
  moduleId: string;
  moduleTitle: string | null;
  sections: UnitContentsSection[];
  ungroupedItems: UnitContentsItem[];
}

export type UnitStatus = 'done' | 'active' | 'locked';

export interface UnitSummary {
  id: string;
  position: number;
  title: string;
  status: UnitStatus;
  completedLessons: number;
  totalLessons: number;
}

export interface CourseLevelGroup {
  id: string;
  title: string;
  position: number;
  units: UnitSummary[];
}

export interface CourseInfo {
  id: string;
  title: string;
  cefrLevel: string;
  targetLanguage: string;
  schoolName?: string;
  groupName?: string;
}

/**
 * Client-composed equivalent of the web BFF's `CourseHomePayload`
 * (ssz-platform-web/src/app/api/learning/course-home/[courseId]/route.ts).
 * Built by src/api/courseHome.ts (Phase 2), not returned directly by any
 * single gateway endpoint.
 */
export interface CourseHomePayload {
  courseInfo: CourseInfo;
  units: UnitSummary[];
  levels: CourseLevelGroup[];
  progress: CourseProgress;
  mastery: CourseMastery;
  srsDueCount: number;
  srsReviewedToday: number;
  canDo: CanDoResponse;
}

/* ─────────────────────────────────────────────────────────────────────────
 * SRS — see src/api/srs.ts
 *
 * The shapes that used to live here were copied from
 * ssz-platform-web/src/features/learning/types.ts, which turned out to
 * describe an API that does not exist (numeric ratings, a front/back the
 * server never returned). They are gone; the verified contract lives next
 * to its calls in src/api/srs.ts.
 * ────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
 * Auth
 * Source: ssz-platform/services/auth-service/src/AuthService.Application/DTOs/AuthDtos.cs
 * (`AuthTokensResponse` record; ASP.NET Core's default System.Text.Json
 * serializer camel-cases record properties, so `AccessTokenExpiresAt` →
 * `accessTokenExpiresAt` on the wire).
 * ────────────────────────────────────────────────────────────────────── */

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 datetime string. */
  accessTokenExpiresAt: string;
  /** ISO 8601 datetime string. */
  refreshTokenExpiresAt: string;
}

/** Returned by `POST /auth/login` instead of tokens when 2FA is enabled. */
export interface MfaRequiredResponse {
  mfaRequired: true;
  challenge: unknown;
}
