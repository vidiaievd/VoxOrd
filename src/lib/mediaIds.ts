/**
 * The media assets a piece of course content refers to — lesson narration and images,
 * vocabulary pronunciations and example audio, exercise clips (offline plan, B3).
 *
 * Found by field name rather than by a list per content type: the content of twenty templates,
 * the reader and the vocabulary reader each name their media differently (`mediaIds`,
 * `audioMediaId`, `pronunciationAudioMediaId`, `media_id`, `assetId`), and a new template
 * should not be left online-only for want of an entry here. Only ids are taken — a value must
 * look like a UUID — so a field that happens to match the pattern cannot pull in junk.
 */

const MEDIA_KEY = /(media_?ids?|asset_?ids?)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function collectMediaIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  walk(value, false, into, 0);
  return into;
}

function walk(value: unknown, underMediaKey: boolean, into: Set<string>, depth: number): void {
  // Content is shallow; a guard against a cycle or a pathological document all the same.
  if (depth > 40 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (underMediaKey && UUID.test(value)) into.add(value.toLowerCase());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, underMediaKey, into, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walk(child, MEDIA_KEY.test(key), into, depth + 1);
    }
  }
}
