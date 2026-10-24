/*
 * Hand-written checks for answers that feed Today (no zod on the phone). Each reads one value
 * and says whether it is what the screen needs; the callers degrade to `null` on a "no".
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** A string, or null for anything else — absent, null, or the wrong type. */
export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
