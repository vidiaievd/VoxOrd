import { apiClient } from './client';
import { isRecord, isString } from './guards';
import type { ProsodyLayer, WordSounds } from '../kernel/prosody';

/* ─────────────────────────────────────────────────────────────────────────
 * The pronunciation layer of a text (platform plan 86, VoxOrd step 7b).
 *
 * content-service `GET /exercises/:id/prosody` (one layer per `read` prompt) and
 * `GET /lessons/:id/variants/:variantId/prosody` (one per paragraph, anchors local to it).
 * The web reads the same routes through its BFF, which turns every miss into an empty list;
 * the phone does the same below, but lets a network failure throw so the cached layer
 * (`useSwrResource`) is kept rather than overwritten with «no marks».
 *
 * The layer and the sounds are the kernel's own shapes, produced by the same kernel on the
 * server — only the envelope is checked here. Marks are for reading: a layer that does not
 * fit its text is dropped by the caller (`text` guards against a layer of other words).
 * ────────────────────────────────────────────────────────────────────── */

const exercisePath = (exerciseId: string) => `/api/v1/exercises/${exerciseId}/prosody`;
const lessonPath = (lessonId: string, variantId: string) =>
  `/api/v1/lessons/${lessonId}/variants/${variantId}/prosody`;

/** A text with the layer drawn for it; `text` guards against a layer made for other words. */
export interface TextProsody {
  text: string;
  layer: ProsodyLayer;
  /** The lexicon's letters over sounds of the words; empty when it has none. */
  sounds: WordSounds[];
}

function readEntry(raw: unknown): TextProsody | null {
  if (!isRecord(raw) || !isString(raw.text) || !isRecord(raw.layer)) return null;
  const layer = raw.layer as unknown as ProsodyLayer;
  // A layer without its element lists cannot be drawn; skip it rather than crash the text.
  if (!Array.isArray(layer.stresses) || !Array.isArray(layer.boundaries)) return null;
  return {
    text: raw.text,
    layer,
    sounds: Array.isArray(raw.sounds) ? (raw.sounds as WordSounds[]) : [],
  };
}

/** The layers of a `read_aloud` exercise by prompt id. Empty when there are none. */
export async function getExerciseProsody(exerciseId: string): Promise<Record<string, TextProsody>> {
  const body = await apiClient.get<unknown>(exercisePath(exerciseId));
  const out: Record<string, TextProsody> = {};
  if (!isRecord(body) || !Array.isArray(body.prompts)) return out;
  for (const p of body.prompts) {
    if (!isRecord(p) || !isString(p.promptId)) continue;
    const entry = readEntry(p);
    if (entry) out[p.promptId] = entry;
  }
  return out;
}

/** The layers of a text lesson variant by the paragraph's index in it. Empty when none. */
export async function getLessonProsody(
  lessonId: string,
  variantId: string,
): Promise<Record<number, TextProsody>> {
  const body = await apiClient.get<unknown>(lessonPath(lessonId, variantId));
  const out: Record<number, TextProsody> = {};
  if (!isRecord(body) || !Array.isArray(body.paragraphs)) return out;
  for (const p of body.paragraphs) {
    if (!isRecord(p) || typeof p.paragraphIndex !== 'number') continue;
    const entry = readEntry(p);
    if (entry) out[p.paragraphIndex] = entry;
  }
  return out;
}
