import { useEffect, useState } from 'react';
import { getLessonVariant } from '../api/lessons';
import type { LessonAudioRef } from '../lib/audio';

/**
 * The token content-service writes for a lesson's narration, mirrored from
 * `MarkdownMediaParserService` (`[audio:id "label"]`). Only the id is wanted here.
 */
const AUDIO_TOKEN = /\[audio:([a-zA-Z0-9_-]+)(?:\s+"[^"]*")?\]/;

/**
 * The narration an exercise borrows from a lesson — plan 56 §3.8.
 *
 * `source: 'lesson'` stores a reference and not a copy, so replacing the recording in
 * the lesson replaces it in every exercise that borrows it. Turning that reference into
 * an asset id means reading the lesson variant's body, and it is done **here, on the
 * device**, for the same reason the browser does it in the reader: two services project
 * this block — content-service and the exercise engine — and only one of them has
 * lessons, so a server-side resolution would leave the practice envelope silently
 * without a clip.
 *
 * A deleted lesson, a replaced variant, a body whose token is gone: each answers `null`,
 * which the player shows as a clip that cannot be played — the same state as a broken
 * link, and never a crash.
 */
const cache = new Map<string, string | null>();

export function useLessonClip(ref: LessonAudioRef | null): string | undefined {
  const lessonId = ref?.lessonId ?? '';
  const variantId = ref?.variant ?? '';
  const key = `${lessonId}:${variantId}`;

  const [clip, setClip] = useState<string | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    if (lessonId === '' || variantId === '') {
      setClip(null);
      return;
    }

    const cached = cache.get(`${lessonId}:${variantId}`);
    if (cached !== undefined) {
      setClip(cached);
      return;
    }

    let cancelled = false;
    (async () => {
      let found: string | null = null;
      try {
        const variant = await getLessonVariant(lessonId, variantId);
        found = variant.bodyMarkdown.match(AUDIO_TOKEN)?.[1] ?? null;
      } catch {
        // A lost connection is not a wrong answer about the lesson, so it is not cached:
        // the next time this exercise opens, the question is asked again.
        if (!cancelled) setClip(null);
        return;
      }
      // The body of a published lesson changes rarely, and a learner who replays an
      // exercise three times should ask about it once.
      cache.set(`${lessonId}:${variantId}`, found);
      if (!cancelled) setClip(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [lessonId, variantId]);

  return clip ?? undefined;
}
