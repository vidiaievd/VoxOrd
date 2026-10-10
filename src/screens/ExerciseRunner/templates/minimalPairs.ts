/**
 * Pure logic for `minimal_pairs` — one word played, and the two or three it could have been
 * (plan 72, phase 9).
 *
 * What arrives here is never the stored document but a **projection** of it: the instruction,
 * the contrast's label, how many probes the sitting has and the listening rules. The pairs, the
 * words, the clips and the pass mark stay on the server. A probe comes one at a time from
 * `/items` with its clip and its buttons, and the verdict from `/answers` names the key only
 * once the probe is closed (§3.2, §3.6).
 *
 * Nothing on this side judges a pick. The same readers and the same sitting rules as the web
 * runner (`minimal-pairs-projection.ts`, `minimal-pairs-sitting.ts`), so the two platforms
 * cannot drift on which probe is next, what a reload restores or what the pips show.
 */

/* ── The projection ────────────────────────────────────────────────────────── */

/** Listens per probe; `0` is unlimited. The kernel's `PLAYS_PER_PROBE`. */
export const PLAYS_PER_PROBE: readonly number[] = [1, 2, 3, 0];
export type GlossPolicy = 'always' | 'afterAnswer' | 'never';
const GLOSS_POLICIES: readonly GlossPolicy[] = ['always', 'afterAnswer', 'never'];

export interface MinimalPairsFeedback {
  immediate: boolean;
  abCompare: boolean;
  showSpelling: 'always' | 'afterAnswer';
  showGloss: GlossPolicy;
  showIpa: boolean;
  secondChance: boolean;
}

/** `ExerciseDisplay.content` for this template (and the attempt's start), as the kernel's `StudentProjection`. */
export interface MinimalPairsProjection {
  title: string;
  instruction: string;
  language: string;
  contrast: { label: string; ipa: string };
  set: { probes: number; playsPerProbe: number; autoplay: boolean };
  feedback: MinimalPairsFeedback;
}

/**
 * Names that belong to the key or to the grading — none may reach a student (§3.2): the pairs are
 * the words and the clips, and which clip is which word is the answer; `scoring` holds the pass
 * mark, which comes back only with the result.
 */
const ROOT_KEY = ['pairs', 'scoring', 'contrastId', 'note', 'passPct'];

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Accept the set only if what arrived is the student projection.
 *
 * A projection carrying any of `ROOT_KEY` is the stored document — an engine or a route that
 * reached for the authoring copy. Refused rather than stripped, for the reason every
 * server-graded type gives (plan 50's finding): a runner that works over a screen holding the key
 * looks exactly like one that does not.
 */
export function readMinimalPairsProjection(value: unknown): MinimalPairsProjection | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (ROOT_KEY.some(k => k in raw)) return null;

  const set = record(raw.set);
  const probes = set.probes;
  if (typeof probes !== 'number' || !Number.isInteger(probes) || probes < 0) return null;
  const plays = set.playsPerProbe;
  const contrast = record(raw.contrast);
  const f = record(raw.feedback);
  const gloss = f.showGloss;

  return {
    title: text(raw.title),
    instruction: text(raw.instruction),
    language: text(raw.language),
    contrast: { label: text(contrast.label), ipa: text(contrast.ipa) },
    set: {
      probes,
      // Anything out of range is read as the default budget of two: a wrong guess at
      // «unlimited» would be the one that gives answers away.
      playsPerProbe: typeof plays === 'number' && PLAYS_PER_PROBE.includes(plays) ? plays : 2,
      autoplay: set.autoplay !== false,
    },
    feedback: {
      immediate: f.immediate !== false,
      abCompare: f.abCompare !== false,
      showSpelling: f.showSpelling === 'always' ? 'always' : 'afterAnswer',
      showGloss: GLOSS_POLICIES.includes(gloss as GlossPolicy)
        ? (gloss as GlossPolicy)
        : 'afterAnswer',
      showIpa: f.showIpa === true,
      secondChance: f.secondChance === true,
    },
  };
}

/* ── A probe, its verdict and the result ───────────────────────────────────── */

export interface Probe {
  /** 1-based place in the sitting. */
  n: number;
  total: number;
  /** What `/answers` names this probe by: `p<n>`. */
  questionId: string;
  clip: {
    url: string;
    expiresAt: string;
    durationMs: number;
    provenance: 'studio' | 'teacher' | 'tts';
    /** A dialect id of the language pack, or empty. */
    dialect: string;
  };
  options: Array<{ id: string; text?: string; gloss?: string; ipa?: string }>;
  state: { tries: number; maxTries: number; closed: boolean };
  /** How each earlier probe went on its first answer — the pips after a reload. */
  closedProbes: Array<{ n: number; correct: boolean }>;
}

export interface ProbeVerdict {
  questionId: string;
  n: number;
  optionId: string;
  correct: boolean;
  closed: boolean;
  tries: number;
  triesLeft: number;
  /** The first answer is the one that scores — what the pip shows. */
  firstCorrect: boolean;
  keyOptionId?: string;
  options?: Array<{ id: string; text: string; gloss?: string; ipa?: string }>;
  compare?: { chosen: string; target: string };
}

export interface SummaryPair {
  pairId: string;
  words: string[];
  played: number;
  correct: number;
  /** A signed link per word; an empty string where a clip could not be signed. */
  clips: string[];
}

export interface MinimalPairsSummary {
  right: number;
  total: number;
  score: number;
  passed: boolean;
  passPct: number;
  memory?: 'contrast' | 'contrast+word' | 'none';
  pairs: SummaryPair[];
}

/**
 * The probe `/items` handed out, or `null` when it is not one. Refused outright when it names its
 * own key — a probe that does is not a probe.
 */
export function readProbe(value: unknown): Probe | null {
  const raw = record(value);
  const { n, total, questionId } = raw;
  if (typeof n !== 'number' || typeof total !== 'number' || typeof questionId !== 'string') {
    return null;
  }
  if ('keyOptionId' in raw || 'wordId' in raw) return null;

  const clip = record(raw.clip);
  if (typeof clip.url !== 'string' || clip.url === '') return null;
  const provenance = clip.provenance;

  if (!Array.isArray(raw.options)) return null;
  const options: Probe['options'] = [];
  for (const entry of raw.options as unknown[]) {
    const o = record(entry);
    if (typeof o.id !== 'string' || o.id === '') return null;
    options.push({
      id: o.id,
      ...(typeof o.text === 'string' ? { text: o.text } : {}),
      ...(typeof o.gloss === 'string' && o.gloss !== '' ? { gloss: o.gloss } : {}),
      ...(typeof o.ipa === 'string' && o.ipa !== '' ? { ipa: o.ipa } : {}),
    });
  }
  if (options.length < 2) return null;

  const state = record(raw.state);
  const closedProbes = Array.isArray(raw.closedProbes)
    ? (raw.closedProbes as unknown[]).flatMap(entry => {
        const c = record(entry);
        return typeof c.n === 'number' && typeof c.correct === 'boolean'
          ? [{ n: c.n, correct: c.correct }]
          : [];
      })
    : [];

  return {
    n,
    total,
    questionId,
    clip: {
      url: clip.url,
      expiresAt: text(clip.expiresAt),
      durationMs: typeof clip.durationMs === 'number' ? clip.durationMs : 0,
      provenance: provenance === 'tts' || provenance === 'teacher' ? provenance : 'studio',
      dialect: text(clip.dialect),
    },
    options,
    state: {
      tries: typeof state.tries === 'number' ? state.tries : 0,
      maxTries: typeof state.maxTries === 'number' && state.maxTries > 0 ? state.maxTries : 1,
      closed: false,
    },
    closedProbes,
  };
}

/** One answer's verdict, as `/answers` returned it in `result`, or `null`. */
export function readProbeVerdict(value: unknown): ProbeVerdict | null {
  const r = record(value);
  if (typeof r.questionId !== 'string' || typeof r.correct !== 'boolean') return null;
  if (typeof r.closed !== 'boolean') return null;
  const closed = r.closed;
  const verdict: ProbeVerdict = {
    questionId: r.questionId,
    n: typeof r.n === 'number' ? r.n : 0,
    optionId: text(r.optionId),
    correct: r.correct,
    closed,
    tries: typeof r.tries === 'number' ? r.tries : 1,
    triesLeft: typeof r.triesLeft === 'number' ? r.triesLeft : 0,
    firstCorrect: r.firstCorrect === true,
  };
  // The key and the reveal mean something only on a closed probe; on an open one they are not
  // read even if sent — the screen must not show what the dosing withheld.
  if (!closed) return verdict;
  if (typeof r.keyOptionId === 'string') verdict.keyOptionId = r.keyOptionId;
  if (Array.isArray(r.options)) {
    verdict.options = (r.options as unknown[]).flatMap(entry => {
      const o = record(entry);
      if (typeof o.id !== 'string' || typeof o.text !== 'string') return [];
      return [
        {
          id: o.id,
          text: o.text,
          ...(typeof o.gloss === 'string' && o.gloss !== '' ? { gloss: o.gloss } : {}),
          ...(typeof o.ipa === 'string' && o.ipa !== '' ? { ipa: o.ipa } : {}),
        },
      ];
    });
  }
  const compare = record(r.compare);
  if (typeof compare.chosen === 'string' && typeof compare.target === 'string') {
    verdict.compare = { chosen: compare.chosen, target: compare.target };
  }
  return verdict;
}

/** The result of a sitting from the submit's `details`, or `null`. */
export function readMinimalPairsSummary(value: unknown): MinimalPairsSummary | null {
  const d = record(value);
  const { right, total, score, passPct } = d;
  if (
    typeof right !== 'number' ||
    typeof total !== 'number' ||
    typeof score !== 'number' ||
    typeof passPct !== 'number' ||
    typeof d.passed !== 'boolean'
  ) {
    return null;
  }
  const memory = d.memory;
  const pairs = Array.isArray(d.pairs)
    ? (d.pairs as unknown[]).flatMap((entry): SummaryPair[] => {
        const p = record(entry);
        if (typeof p.pairId !== 'string' || !Array.isArray(p.words)) return [];
        return [
          {
            pairId: p.pairId,
            words: (p.words as unknown[]).filter((w): w is string => typeof w === 'string'),
            played: typeof p.played === 'number' ? p.played : 0,
            correct: typeof p.correct === 'number' ? p.correct : 0,
            clips: Array.isArray(p.clips)
              ? (p.clips as unknown[]).map(c => (typeof c === 'string' ? c : ''))
              : [],
          },
        ];
      })
    : [];
  return {
    right,
    total,
    score,
    passed: d.passed,
    passPct,
    ...(memory === 'contrast' || memory === 'contrast+word' || memory === 'none'
      ? { memory }
      : {}),
    pairs,
  };
}

/** Minutes the card promises: a quarter of a minute a probe, never under one. */
export function estimatedMinutes(probes: number): number {
  return Math.max(1, Math.round(probes * 0.25));
}

/* ── The sitting ───────────────────────────────────────────────────────────── */

/** Why a command failed, for the line the body shows. */
export type SittingFailure =
  /** The clip of the probe cannot be signed right now; nothing was recorded. */
  | 'media'
  /** The answer did not arrive; the probe is as it was. */
  | 'answer'
  /** The probe could not be fetched. */
  | 'probe'
  /** The result could not be fetched. */
  | 'finish';

export interface SittingState {
  phase: 'loading' | 'probe' | 'finishing' | 'done' | 'failed';
  probe: Probe | null;
  /** The first answer of every probe closed so far, by probe number — the pips. */
  pips: Record<number, boolean>;
  /** Listens spent on the probe on screen. */
  plays: number;
  /** A wrong answer with a try left: «Ikke helt…», buttons open again. */
  retried: boolean;
  /** The verdict that closed the probe on screen; `null` while it is open. */
  verdict: ProbeVerdict | null;
  /** The button handed in last — the one the closing verdict judged. */
  picked: string | null;
  summary: MinimalPairsSummary | null;
  sending: boolean;
  failure: SittingFailure | null;
}

export type SittingAction =
  | { type: 'loading' }
  | { type: 'handed'; probe: Probe }
  | { type: 'played' }
  | { type: 'sending'; optionId: string }
  | { type: 'retry' }
  | { type: 'closed'; verdict: ProbeVerdict }
  | { type: 'finishing' }
  | { type: 'finished'; summary: MinimalPairsSummary }
  | { type: 'failed'; failure: SittingFailure };

export const INITIAL_SITTING: SittingState = {
  phase: 'loading',
  probe: null,
  pips: {},
  plays: 0,
  retried: false,
  verdict: null,
  picked: null,
  summary: null,
  sending: false,
  failure: null,
};

export function sittingReducer(state: SittingState, action: SittingAction): SittingState {
  switch (action.type) {
    case 'loading':
      return { ...state, phase: 'loading', failure: null };
    case 'handed': {
      const pips = { ...state.pips };
      for (const c of action.probe.closedProbes) pips[c.n] = c.correct;
      return {
        ...state,
        phase: 'probe',
        probe: action.probe,
        pips,
        plays: 0,
        // A reload on a second chance comes back with a try already spent.
        retried: action.probe.state.tries > 0,
        verdict: null,
        picked: null,
        sending: false,
        failure: null,
      };
    }
    case 'played':
      return { ...state, plays: state.plays + 1 };
    case 'sending':
      return { ...state, sending: true, picked: action.optionId, failure: null };
    case 'retry':
      return { ...state, sending: false, retried: true };
    case 'closed': {
      const n = state.probe?.n;
      return {
        ...state,
        sending: false,
        verdict: action.verdict,
        pips: n === undefined ? state.pips : { ...state.pips, [n]: action.verdict.firstCorrect },
      };
    }
    case 'finishing':
      return { ...state, phase: 'finishing', failure: null };
    case 'finished':
      return { ...state, phase: 'done', summary: action.summary, failure: null };
    case 'failed':
      return {
        ...state,
        sending: false,
        // A failed answer leaves the probe where it was; anything else has nothing to show.
        phase: action.failure === 'answer' ? state.phase : 'failed',
        failure: action.failure,
      };
  }
}
