/**
 * Pure mapping logic for `sentence_schema` (Norwegian "setningsskjema" —
 * placing sentence tokens into topological fields). Wire shapes confirmed
 * against content-service's seeded template (seed.ts ~327-400) and
 * exercise-engine's `SentenceSchemaValidator`.
 */

export interface SentenceSchemaField {
  id: string;
  label: string;
}

export interface SentenceSchemaToken {
  id: string;
  text: string;
}

export interface SentenceSchemaPrefilled {
  field_id: string;
  token_id: string;
}

/** `ExerciseDisplay.content` for this template. */
export interface SentenceSchemaContent {
  sentence: string;
  schema_type: 'main' | 'subordinate';
  fields: SentenceSchemaField[];
  tokens: SentenceSchemaToken[];
  /** Scaffolding tokens already placed and locked (not movable by the student). */
  prefilled?: SentenceSchemaPrefilled[];
  context?: string;
}

/** field_id → ordered token ids currently placed in that field. Order matters. */
export type Placements = Record<string, string[]>;

export interface SentenceSchemaAnswer {
  placements: { field_id: string; token_ids: string[] }[];
  explanation?: string;
}

/** Builds the initial placements from `content.prefilled`, grouped by field. */
export function initialPlacements(prefilled?: SentenceSchemaPrefilled[]): Placements {
  const placements: Placements = {};
  for (const entry of prefilled ?? []) {
    placements[entry.field_id] = [...(placements[entry.field_id] ?? []), entry.token_id];
  }
  return placements;
}

export function lockedTokenIds(prefilled?: SentenceSchemaPrefilled[]): Set<string> {
  return new Set((prefilled ?? []).map((p) => p.token_id));
}

/** Tokens not yet placed in any field, in the original content order. */
export function poolTokenIds(tokens: SentenceSchemaToken[], placements: Placements): string[] {
  const placed = new Set(Object.values(placements).flat());
  return tokens.filter((t) => !placed.has(t.id)).map((t) => t.id);
}

/** Places `tokenId` at the end of `fieldId`, removing it from any other field first. Pure. */
export function placeToken(placements: Placements, fieldId: string, tokenId: string): Placements {
  const next: Placements = {};
  for (const [field, ids] of Object.entries(placements)) {
    const filtered = ids.filter((id) => id !== tokenId);
    if (filtered.length > 0) next[field] = filtered;
  }
  next[fieldId] = [...(next[fieldId] ?? []), tokenId];
  return next;
}

/** Removes `tokenId` from wherever it's placed, returning it to the pool. Pure. */
export function removeToken(placements: Placements, tokenId: string): Placements {
  const next: Placements = {};
  for (const [field, ids] of Object.entries(placements)) {
    const filtered = ids.filter((id) => id !== tokenId);
    if (filtered.length > 0) next[field] = filtered;
  }
  return next;
}

/** Submittable once every token in the exercise has been placed somewhere. */
export function sentenceSchemaCanSubmit(
  placements: Placements,
  tokens: SentenceSchemaToken[],
): boolean {
  if (tokens.length === 0) return false;
  const placed = new Set(Object.values(placements).flat());
  return tokens.every((t) => placed.has(t.id));
}

/** One entry per content field (empty array if nothing was placed there). */
export function buildSentenceSchemaAnswer(
  placements: Placements,
  fields: SentenceSchemaField[],
  tokens: SentenceSchemaToken[],
): SentenceSchemaAnswer | null {
  if (!sentenceSchemaCanSubmit(placements, tokens)) return null;
  return {
    placements: fields.map((f) => ({ field_id: f.id, token_ids: placements[f.id] ?? [] })),
  };
}

/** Reads `{field_id,token_ids}[]` back out of an opaque `feedback.correctAnswer`. */
export function extractExpectedPlacements(
  correctAnswer: unknown,
): { field_id: string; token_ids: string[] }[] | null {
  if (
    !correctAnswer ||
    typeof correctAnswer !== 'object' ||
    !Array.isArray((correctAnswer as { placements?: unknown }).placements)
  ) {
    return null;
  }
  const placements = (correctAnswer as SentenceSchemaAnswer).placements;
  const valid = placements.every(
    (p) => p && typeof p.field_id === 'string' && Array.isArray(p.token_ids),
  );
  return valid ? placements : null;
}

/** Order-sensitive match, mirroring the server's field-by-field comparison. */
export function isFieldCorrect(
  expectedPlacements: { field_id: string; token_ids: string[] }[],
  fieldId: string,
  submittedTokenIds: string[],
): boolean {
  const expected = expectedPlacements.find((p) => p.field_id === fieldId)?.token_ids ?? [];
  return (
    expected.length === submittedTokenIds.length &&
    expected.every((id, i) => id === submittedTokenIds[i])
  );
}
