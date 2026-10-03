// ---------------------------------------------------------------------------
// PARTIAL MIRROR — the read-back half of
// ssz-platform/packages/shared-kernel/src/audio/projection.ts.
//
// The writing half (`withStudentAudio`, `redactTranscript`, `transcriptOnReveal`)
// belongs to the two services that project a document; a client only ever reads
// what they wrote. `deliveredSegments` is that read, copied byte for byte so the
// phone unpacks the timecodes exactly as the browser does.
// ---------------------------------------------------------------------------

import type { ItemAudio } from './model';

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The timecodes as they arrive on the wire, read back by a runner.
 *
 * The mirror of what `withStudentAudio` wrote, and defensive in the same way as
 * `audioOf`: a runner meeting a document from before this feature — or one whose author
 * has since turned timecodes off — gets an empty map rather than an exception.
 */
export function deliveredSegments(content: unknown): Record<string, ItemAudio> {
  const audio = record(record(content)?.['audio']);
  const segments = record(audio?.['segments']);
  if (segments === null) return {};

  const out: Record<string, ItemAudio> = {};
  for (const [id, value] of Object.entries(segments)) {
    const seg = record(value);
    const start = seg?.['start'];
    const end = seg?.['end'];
    if (typeof start === 'number' && typeof end === 'number') out[id] = { start, end };
  }
  return out;
}
