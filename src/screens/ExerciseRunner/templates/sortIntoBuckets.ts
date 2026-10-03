/**
 * Pure mapping logic for `sort_into_buckets` — tiles to put into zones, the whole board
 * checked as one block (plan 66).
 *
 * What arrives here is never the stored document but a **projection** of it
 * (shared-kernel `sort-into-buckets/projection.ts`, applied by content-service's
 * `studentSafeContent`): which zone each tile belongs in, the zones it is also accepted
 * in, the author's reason for it, each zone's rule and the per-zone explanations all stay
 * on the server, in the other column (plan 66 §3.2). What a zone may show before a check
 * is the first clause of its rule, and only when the author turned hints on — cut on the
 * server, so the rule itself never travels.
 *
 * Nothing on this side grades, and nothing on this side could. The mechanism is the one
 * `multiple_choice_group` has (plan 66 §3.1): a check reports which tiles are wrong and
 * why the zone they were put in is wrong; only a **closed** board carries the right zone,
 * the rules and the reasons. A retry offered by a device already holding the key would be
 * decoration.
 *
 * The same rules as the web solver (`sort-into-buckets-solver.tsx`), function for
 * function, so the two platforms cannot drift on what a retry keeps or what a tile shows.
 */

/* ── The projected board ─────────────────────────────────────────────────── */

/** One zone. Never reordered here — the author's order is the order on screen. */
export interface ProjectedBucket {
  id: string;
  label: string;
  /** The first clause of the zone's rule, present only under the author's `hints`. */
  hint?: string;
}

/** One tile as the runner receives it — never a hint at which zone it belongs in. */
export interface ProjectedTile {
  id: string;
  text: string;
  /** The tile's own recording, under the audio layer's `source: 'items'`. */
  mediaId?: string;
}

/**
 * The settings that change what the student sees or may do.
 *
 * `revealKey` decides how much of the key the *server* sends, and it is read anyway: the
 * runner must know before the first check whether «Show the correct placement» exists,
 * and knowing a key can be shown is not the key. `attempts` is the check budget, `0`
 * meaning no limit — the server enforces it, so a wrong reading here only shows a button
 * it then refuses.
 */
export interface SortIntoBucketsSettings {
  showRemaining: boolean;
  revealKey: boolean;
  attempts: 0 | 1 | 2 | 3;
  /** The share of tiles needed to pass, as a percentage. Compared with `>=`. */
  threshold: number;
}

/** `ExerciseDisplay.content` for this template, as the kernel's `StudentProjection`. */
export interface SortIntoBucketsBoard {
  instruction: string;
  buckets: ProjectedBucket[];
  tiles: ProjectedTile[];
  settings: SortIntoBucketsSettings;
}

/**
 * Accept the board only if what arrived is the student projection.
 *
 * The key for this template is `bucketId` / `also` on an item, `why` beside it, `rule` on
 * a zone and the whole `fb` map. A tile or zone that arrives carrying any of them is the
 * stored document, not the projection — a content-service older than plan 66 phase 3, or
 * a route that reached for the authoring copy.
 *
 * The answer is to refuse, not to strip the fields here: stripping would leave a runner
 * that works, a retry that is decoration, and nothing on any screen to say the key had
 * been sent (plan 50's finding; plans 51, 53 and 54 repeat it).
 */
export function readSortIntoBucketsBoard(
  value: unknown,
): SortIntoBucketsBoard | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;

  const raw = value as {
    instruction?: unknown;
    buckets?: unknown;
    items?: unknown;
    settings?: unknown;
  };
  if (!Array.isArray(raw.buckets) || !Array.isArray(raw.items)) return null;
  if ('fb' in raw) return null;

  const buckets: ProjectedBucket[] = [];
  for (const entry of raw.buckets) {
    if (typeof entry !== 'object' || entry === null) return null;
    const b = entry as Record<string, unknown>;
    if ('rule' in b) return null;

    const id = b.id;
    const label = b.label;
    const hint = b.hint;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof label !== 'string' || label.trim() === '') return null;
    buckets.push({
      id,
      label,
      ...(typeof hint === 'string' && hint.trim() !== '' ? { hint } : {}),
    });
  }

  // Fewer than two zones is not a leak but an unanswerable board; the projection already
  // refuses to build one, so one arriving means the two sides disagree about what is
  // deliverable — worth refusing rather than rendering.
  if (buckets.length < 2) return null;

  const tiles: ProjectedTile[] = [];
  for (const entry of raw.items) {
    if (typeof entry !== 'object' || entry === null) return null;
    const i = entry as Record<string, unknown>;
    if ('bucketId' in i || 'also' in i || 'why' in i) return null;

    const id = i.id;
    const text = i.text;
    const mediaId = i.mediaId;
    if (typeof id !== 'string' || id === '') return null;
    if (typeof text !== 'string' || text.trim() === '') return null;
    tiles.push({
      id,
      text,
      ...(typeof mediaId === 'string' && mediaId !== '' ? { mediaId } : {}),
    });
  }

  return {
    instruction: typeof raw.instruction === 'string' ? raw.instruction : '',
    buckets,
    tiles,
    settings: readSettings(raw.settings),
  };
}

/** Listed field by field rather than spread, so a field the runner has no business with cannot ride in. */
function readSettings(raw: unknown): SortIntoBucketsSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const attempts = s.attempts;
  const threshold = s.threshold;

  return {
    showRemaining: s.showRemaining === true,
    revealKey: s.revealKey !== false,
    attempts: attempts === 1 || attempts === 2 || attempts === 3 ? attempts : 0,
    threshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? threshold
        : 70,
  };
}

/* ── The verdict ─────────────────────────────────────────────────────────── */

/**
 * One tile's outcome in a check.
 *
 * The optional fields are the contract. `explanation` is why the zone the tile was put in
 * is wrong, and comes only for a wrong tile. `correctBucketId` and `why` arrive **only
 * once the board is closed** and only when the author left the key visible — a right zone
 * shown beside a tile that still has a retry left would make the retry theatre.
 */
export interface SortIntoBucketsItemResult {
  itemId: string;
  /** The zone the tile was in for this check; `null` when it was left in the pool. */
  chosenBucketId: string | null;
  correct: boolean;
  /** Right on the *first* check — the one the score is built on. */
  firstCorrect: boolean;
  /** Where it stood on the first check, carried forward by the engine. */
  firstAnswer: string | null;
  explanation?: string;
  correctBucketId?: string;
  why?: string;
}

/**
 * `details` of a `sort_into_buckets` submission — the state of the board after a check.
 *
 * `closed` and `locked` are the two the runner may not second-guess. `closed` says no
 * further check is possible, whatever budget a count kept here might think is left —
 * all-right and the reveal both close a board with checks unspent. `locked` is the
 * cumulative set of tiles the server froze, and it survives a retry, which is why the
 * runner holds it apart from the verdict.
 */
export interface SortIntoBucketsVerdict {
  totalItems: number;
  /** Right on the first check — the score. */
  passedItems: number;
  /** Right now, after this check. What the line under the board counts. */
  correctNow: number;
  /** 1-based: which check of the board this was. */
  attempt: number;
  /** `null` is no limit. */
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  locked: string[];
  /** Each zone's rule — present only on a closed board with the key visible. */
  rules: { bucketId: string; rule: string }[];
  items: SortIntoBucketsItemResult[];
}

/**
 * Read the server's verdict for one check.
 *
 * Defensive in the same direction as the board reader: a verdict without the fields that
 * say how the board now stands is no verdict, and guessing `closed` either way would
 * either strand the learner on a finished board or offer a check the engine refuses. The
 * optional fields are copied only when they are there — nothing here may stand in for a
 * key that did not arrive.
 */
export function readSortIntoBucketsVerdict(
  value: unknown,
): SortIntoBucketsVerdict | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.closed !== 'boolean') return null;
  if (!Array.isArray(raw.items)) return null;

  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;
  const id = (v: unknown): string | null =>
    typeof v === 'string' && v !== '' ? v : null;

  const items: SortIntoBucketsItemResult[] = [];
  for (const entry of raw.items) {
    if (typeof entry !== 'object' || entry === null) return null;
    const i = entry as Record<string, unknown>;

    const itemId = i.itemId;
    if (typeof itemId !== 'string' || itemId === '') return null;
    if (typeof i.correct !== 'boolean') return null;

    const explanation = str(i.explanation);
    const correctBucketId = str(i.correctBucketId);
    const why = str(i.why);

    items.push({
      itemId,
      chosenBucketId: id(i.chosenBucketId),
      correct: i.correct,
      firstCorrect: i.firstCorrect === true,
      firstAnswer: id(i.firstAnswer),
      ...(explanation === undefined ? {} : { explanation }),
      ...(correctBucketId === undefined ? {} : { correctBucketId }),
      ...(why === undefined ? {} : { why }),
    });
  }

  const locked = Array.isArray(raw.locked)
    ? raw.locked.filter(
        (entry): entry is string => typeof entry === 'string' && entry !== '',
      )
    : [];

  const rules: { bucketId: string; rule: string }[] = [];
  if (Array.isArray(raw.rules)) {
    for (const entry of raw.rules) {
      if (typeof entry !== 'object' || entry === null) continue;
      const r = entry as Record<string, unknown>;
      const bucketId = id(r.bucketId);
      const rule = str(r.rule);
      if (bucketId !== null && rule !== undefined)
        rules.push({ bucketId, rule });
    }
  }

  const checksLeft = raw.checksLeft;

  return {
    totalItems: num(raw.totalItems, items.length),
    passedItems: num(raw.passedItems, items.filter(i => i.firstCorrect).length),
    correctNow: num(raw.correctNow, items.filter(i => i.correct).length),
    attempt: Math.max(1, num(raw.attempt, 1)),
    checksLeft:
      typeof checksLeft === 'number' && Number.isFinite(checksLeft)
        ? Math.max(0, checksLeft)
        : null,
    closed: raw.closed,
    revealed: raw.revealed === true,
    locked,
    rules,
    items,
  };
}

/* ── What goes up ────────────────────────────────────────────────────────── */

/** `tileId → bucketId`. A tile still in the pool is simply absent. */
export type SortIntoBucketsPlacements = Record<string, string>;

/** The `submittedAnswer` of one check of the board. */
export interface SortIntoBucketsSubmission {
  placements: { itemId: string; bucketId: string }[];
  /** «Show the correct placement»: the board closes, and the attempt counts as failed. */
  reveal?: boolean;
}

/**
 * Every placement, every time, frozen tiles included: the server ignores a move of a tile
 * it froze, and sending only the new ones would make a check depend on what this device
 * remembers rather than on what the board says.
 *
 * Nothing else is sent. Which check this is, which tiles are frozen and where each stood
 * the first time are facts about the attempt, and the engine writes its own over anything
 * a client puts in their place (plan 66 phase 4).
 */
export function buildSortIntoBucketsSubmission(
  placements: SortIntoBucketsPlacements,
  reveal = false,
): SortIntoBucketsSubmission {
  return {
    placements: Object.entries(placements).map(([itemId, bucketId]) => ({
      itemId,
      bucketId,
    })),
    ...(reveal ? { reveal: true } : {}),
  };
}

/** Put a tile in a zone, or back in the pool with `null`. A frozen tile is not the student's to move. */
export function placeTile(
  placements: SortIntoBucketsPlacements,
  locked: readonly string[],
  tileId: string,
  bucketId: string | null,
): SortIntoBucketsPlacements {
  if (locked.includes(tileId)) return placements;
  const next = { ...placements };
  if (bucketId === null) delete next[tileId];
  else next[tileId] = bucketId;
  return next;
}

/* ── How the board is drawn ──────────────────────────────────────────────── */

/**
 * How a tile is drawn.
 *
 * `placed` is a tile put down and not yet checked; `ok` is one the server froze; `bad` is
 * one it checked and found in the wrong zone; `key` is a tile drawn in the zone it belongs
 * to, which only a closed board with the key visible ever shows.
 */
export type TileState = 'pool' | 'placed' | 'ok' | 'bad' | 'key';

export interface TileView {
  tile: ProjectedTile;
  state: TileState;
  /** The zone it is drawn in; `null` is the pool. */
  zone: string | null;
}

/** Where every tile stands and how it looks — the web body's `placeOf`, tile for tile. */
export function tileViews(
  tiles: readonly ProjectedTile[],
  placements: SortIntoBucketsPlacements,
  verdict: SortIntoBucketsVerdict | null,
  locked: readonly string[],
): TileView[] {
  const outcomes = new Map(
    (verdict?.items ?? []).map(item => [item.itemId, item]),
  );
  const frozen = new Set(locked);

  return tiles.map(tile => {
    const outcome = outcomes.get(tile.id);
    const here = placements[tile.id];

    // A closed board that was allowed to show its key draws a wrong tile where it belongs.
    if (outcome?.correctBucketId !== undefined && !outcome.correct) {
      return { tile, state: 'key', zone: outcome.correctBucketId };
    }
    if (frozen.has(tile.id)) return { tile, state: 'ok', zone: here ?? null };
    if (here === undefined) return { tile, state: 'pool', zone: null };
    if (
      outcome !== undefined &&
      !outcome.correct &&
      outcome.chosenBucketId === here
    ) {
      return { tile, state: 'bad', zone: here };
    }
    return { tile, state: 'placed', zone: here };
  });
}

/** A tile that is still the student's to move. */
export function isMovable(state: TileState): boolean {
  return state === 'pool' || state === 'placed';
}

/** Placed and not yet checked — what «Check (N)» counts, and the Check gate. */
export function uncheckedCount(views: readonly TileView[]): number {
  return views.filter(view => view.state === 'placed').length;
}

/** Checked and wrong — what «Try the wrong ones again (N)» counts. */
export function wrongCount(views: readonly TileView[]): number {
  return views.filter(view => view.state === 'bad').length;
}

/**
 * The lines under a zone: why a wrong tile's zone is wrong, and — on a closed board with
 * the key visible — why each tile belongs where it does. Drawn as they came.
 */
export function zoneNotes(
  views: readonly TileView[],
  bucketId: string,
  verdict: SortIntoBucketsVerdict | null,
): { id: string; text: string; body: string }[] {
  if (verdict === null) return [];
  const outcomes = new Map(verdict.items.map(item => [item.itemId, item]));

  return views
    .filter(view => view.zone === bucketId)
    .flatMap(({ tile, state }) => {
      const outcome = outcomes.get(tile.id);
      if (outcome === undefined) return [];
      if (state === 'bad' && outcome.explanation !== undefined) {
        return [{ id: tile.id, text: tile.text, body: outcome.explanation }];
      }
      if (outcome.why !== undefined)
        return [{ id: tile.id, text: tile.text, body: outcome.why }];
      return [];
    });
}

/**
 * «Try the wrong ones again» — exactly the tiles the last check found wrong go back to the
 * pool (AC-S5). Frozen tiles stay; so does a tile placed since the check and not yet
 * checked, which was neither right nor wrong and is the student's work in progress.
 */
export function keepOnRetry(
  placements: SortIntoBucketsPlacements,
  verdict: SortIntoBucketsVerdict,
  locked: readonly string[],
): SortIntoBucketsPlacements {
  const wrong = new Set(
    verdict.items
      .filter(item => !item.correct && item.chosenBucketId !== null)
      .filter(item => placements[item.itemId] === item.chosenBucketId)
      .map(item => item.itemId),
  );

  const kept: SortIntoBucketsPlacements = {};
  for (const [tileId, bucketId] of Object.entries(placements)) {
    if (!wrong.has(tileId) || locked.includes(tileId)) kept[tileId] = bucketId;
  }
  return kept;
}
