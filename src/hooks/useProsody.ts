import { getExerciseProsody, getLessonProsody, type TextProsody } from '../api/prosody';
import { settingsStore, type ProsodyMode } from '../store/settingsStore';
import { useSettings } from './useSettings';
import { useSwrResource } from './useSwrResource';

/** Whether the pronunciation has to be fetched at all — the learner has left «Meaning». */
export function wantsProsody(mode: ProsodyMode): boolean {
  return mode !== 'meaning';
}

/** The pronunciation settings as chosen, with setters that persist. */
export function useProsodySettings() {
  const { prosodyMode, prosodyLens, showProsodyLegend } = useSettings();
  return {
    mode: prosodyMode,
    lens: prosodyLens,
    legend: showProsodyLegend,
    setMode: (v: ProsodyMode) => settingsStore.set('prosodyMode', v),
    setLens: (v: typeof prosodyLens) => settingsStore.set('prosodyLens', v),
    setLegend: (v: boolean) => settingsStore.set('showProsodyLegend', v),
  };
}

/**
 * The layers of a `read_aloud` exercise by prompt id. Fetched only while `enabled`, so a
 * learner who never leaves «Meaning» never costs the lexicon call. Anything but a loaded
 * answer is `null` and the text is drawn plain — marks are never worth an error screen.
 */
export function useExerciseProsody(
  exerciseId: string,
  enabled: boolean,
): Record<string, TextProsody> | null {
  const { data } = useSwrResource<Record<string, TextProsody>>(
    enabled && exerciseId ? `prosody:exercise:${exerciseId}` : null,
    () => getExerciseProsody(exerciseId),
  );
  return data;
}

/** The layers of a text lesson variant by paragraph index; `null` until there is one. */
export function useLessonProsody(
  lessonId: string,
  variantId: string | undefined,
  enabled: boolean,
): Record<number, TextProsody> | null {
  const { data } = useSwrResource<Record<number, TextProsody>>(
    enabled && lessonId && variantId ? `prosody:lesson:${lessonId}:${variantId}` : null,
    () => getLessonProsody(lessonId, variantId as string),
  );
  return data;
}
