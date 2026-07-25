import type { ListeningStage } from '../../../api/lessons';

export type AudioLessonStage = 'listen' | 'gapfill' | 'comprehension' | 'done';

export interface GroupedListeningStages {
  gapFillExerciseIds: string[];
  comprehensionExerciseIds: string[];
}

/**
 * Splits a lesson's listening stages into gap-fill / comprehension exercise
 * id lists, in position order. A stage with no attached exercise (a
 * listen-only step with nothing to grade) is dropped — there's nothing for
 * the exercise runner to run for it. Any `stageType` other than `gap_fill` /
 * `comprehension` is ignored; the narration itself is played from the
 * lesson's `mediaIds`, not from a stage.
 */
export function groupListeningStages(stages: ListeningStage[]): GroupedListeningStages {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const withExercise = (stageType: string) =>
    sorted
      .filter((s) => s.stageType === stageType && s.exercise !== null)
      .map((s) => s.exercise!.id);

  return {
    gapFillExerciseIds: withExercise('gap_fill'),
    comprehensionExerciseIds: withExercise('comprehension'),
  };
}

/**
 * Advances the staged listening flow, skipping any stage with zero exercises
 * — mirrors the web reader's `listening-lesson-page.tsx` sequencing
 * (listen → gapfill → comp → done), just data-driven instead of hardcoded to
 * "both stages always exist".
 */
export function nextAudioLessonStage(
  current: AudioLessonStage,
  hasGapFill: boolean,
  hasComprehension: boolean,
): AudioLessonStage {
  if (current === 'listen') {
    if (hasGapFill) return 'gapfill';
    if (hasComprehension) return 'comprehension';
    return 'done';
  }
  if (current === 'gapfill') {
    return hasComprehension ? 'comprehension' : 'done';
  }
  return 'done';
}
