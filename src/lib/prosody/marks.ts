import {
  respell,
  segsCoverWord,
  type GroupBoundary,
  type PhraseAccent,
  type ProsodyLayer,
  type SoundSeg,
  type WordSounds,
  type WordStress,
} from '../../kernel/prosody';
import { tokenize } from '../../kernel/text/words';
import type { ProsodyLens } from '../../store/settingsStore';

/* ─────────────────────────────────────────────────────────────────────────
 * What a pronunciation layer says about each word, and how a lens draws it
 * (platform plan 86, §4i.2; VoxOrd step 7c). A port of the web's `prosody-text.tsx` minus the
 * drawing: this file decides, `components/prosody` paints.
 * ────────────────────────────────────────────────────────────────────── */

/** The lenses in the order the learner is offered them. */
export const PROSODY_LENSES: readonly ProsodyLens[] = ['stress', 'sounds', 'respell', 'melody'];

/** What the layer and the lexicon say about one word, anchors already checked against the text. */
export interface TokenMarks {
  word: string;
  stress?: WordStress;
  accent?: PhraseAccent;
  boundary?: GroupBoundary;
  linked?: boolean;
  /** Present only when its segments lie over exactly the letters of the word. */
  sounds?: SoundSeg[];
}

/**
 * The marks per word, keyed by the character offset where the word starts in `text`.
 * `tokenOffset` is the index, in the layer's passage, of the first word of `text` — for a
 * block that is only a part of the passage the layer was made for.
 * A mark whose anchor no longer matches its word (stale `w`) is dropped, not misplaced.
 */
export function marksByStart(
  text: string,
  layer: ProsodyLayer,
  sounds: readonly WordSounds[] = [],
  tokenOffset = 0,
): Map<number, TokenMarks> {
  const tokens = tokenize(text);
  const out = new Map<number, TokenMarks>();
  const at = (i: number, w: string) => {
    const token = tokens[i - tokenOffset];
    if (token === undefined || token.w.toLowerCase() !== w.toLowerCase()) return undefined;
    let marks = out.get(token.s);
    if (marks === undefined) out.set(token.s, (marks = { word: token.w }));
    return marks;
  };
  for (const m of layer.stresses) {
    const marks = at(m.i, m.w);
    if (marks) marks.stress = m;
  }
  for (const m of layer.accents) {
    const marks = at(m.i, m.w);
    if (marks) marks.accent = m;
  }
  for (const m of layer.boundaries) {
    const marks = at(m.i, m.w);
    if (marks) marks.boundary = m;
  }
  for (const m of layer.links) {
    const [first] = m.w.split(/\s+/);
    const marks = first === undefined ? undefined : at(m.i, first);
    if (marks) marks.linked = true;
  }
  for (const m of sounds) {
    const marks = at(m.i, m.w);
    if (marks && segsCoverWord(m.segs, m.w.length)) marks.sounds = m.segs;
  }
  return out;
}

/** Whether this lens draws anything on a word with these marks. */
export function drawnIn(lens: ProsodyLens | null, marks: TokenMarks): boolean {
  switch (lens) {
    case 'stress':
      return marks.stress !== undefined;
    case 'sounds':
    case 'respell':
      return marks.sounds !== undefined;
    case 'melody':
      return (
        marks.stress !== undefined ||
        marks.accent !== undefined ||
        marks.boundary !== undefined ||
        marks.linked === true
      );
    default:
      return false;
  }
}

/** A run of the word's own letters, with how it is set. */
export interface FaceSeg {
  text: string;
  /** The stressed vowel colour. */
  accent?: boolean;
  bold?: boolean;
  /** 0–1: the text colour at this strength (a nested Text has no opacity of its own). */
  fade?: number;
  /** A band under a long stressed vowel. */
  band?: boolean;
}

/** How strongly a vowel is said: stressed in full, a secondary stress a little less, the schwa least. */
function vowelFade(seg: SoundSeg): number {
  if (seg.stress === 1 || seg.stress === 2 || seg.stress === null) return 1;
  if (seg.stress === 3) return 0.8;
  return seg.sounds[0] === 'AX' ? 0.4 : 0.62;
}

const isStressedVowel = (seg: SoundSeg) =>
  seg.kind === 'vowel' && (seg.stress === 1 || seg.stress === 2);

/** The letters of the word as the lens sets them. Concatenated, `stress`/`sounds`/`melody` give back `word`. */
export function faceSegs(word: string, marks: TokenMarks, lens: ProsodyLens): FaceSeg[] {
  if ((lens === 'stress' || lens === 'melody') && marks.stress !== undefined) {
    const { s, e, long } = marks.stress.vowel;
    if (s < 0 || e > word.length || s >= e) return [{ text: word }];
    return [
      { text: word.slice(0, s) },
      { text: word.slice(s, e), accent: true, bold: true, band: lens === 'stress' && long === true },
      { text: word.slice(e) },
    ].filter((seg) => seg.text !== '');
  }
  if (lens === 'sounds' && marks.sounds !== undefined) {
    const out: FaceSeg[] = [];
    for (const seg of marks.sounds) {
      const text = word.slice(seg.s, seg.e);
      if (text === '') continue;
      if (seg.kind === 'silent') out.push({ text, fade: 0.22 });
      else if (seg.kind === 'vowel') {
        out.push(
          isStressedVowel(seg)
            ? { text, accent: true, bold: true }
            : { text, fade: vowelFade(seg) },
        );
      } else out.push({ text });
    }
    return out;
  }
  if (lens === 'respell' && marks.sounds !== undefined) {
    return respelledPieces(marks.sounds).map((piece, k) =>
      isStressedVowel(marks.sounds![k]!)
        ? { text: piece, accent: true, bold: true }
        : { text: piece },
    );
  }
  return [{ text: word }];
}

/** The letters each segment is respelled into, in order. */
export function respelledPieces(segs: readonly SoundSeg[]): string[] {
  let written = '';
  return segs.map((_, k) => {
    const upTo = respell(segs.slice(0, k + 1));
    const piece = upTo.slice(written.length);
    written = upTo;
    return piece;
  });
}

/**
 * One piece of the line of signs over a word. A phone cannot put a mark over a letter of a
 * running text, so the signs live on their own line: `gap` is the word's letters set
 * invisible so the next sign stands where its letter stands.
 */
export type SignPart =
  | { kind: 'gap'; text: string }
  | { kind: 'sign'; text: string; tone: 'accent' | 'pitch'; scale: number };

/** The signs over a word under this lens, or `null` when it has none. */
export function signParts(word: string, marks: TokenMarks, lens: ProsodyLens): SignPart[] | null {
  const parts: SignPart[] = [];
  const gap = (text: string) => {
    if (text !== '') parts.push({ kind: 'gap', text });
  };

  if (lens === 'stress' && marks.stress !== undefined) {
    const { s, e } = marks.stress.vowel;
    if (s < 0 || e > word.length || s >= e) return null;
    gap(word.slice(0, s));
    parts.push({ kind: 'sign', text: '×', tone: 'accent', scale: 0.8 });
    return parts;
  }

  if (lens === 'respell' && marks.sounds !== undefined) {
    const pieces = respelledPieces(marks.sounds);
    let any = false;
    marks.sounds.forEach((seg, k) => {
      if (isStressedVowel(seg)) {
        parts.push({ kind: 'sign', text: '×', tone: 'accent', scale: 0.8 });
        any = true;
      } else gap(pieces[k]!);
    });
    return any ? parts : null;
  }

  if (lens === 'sounds' && marks.sounds !== undefined) {
    // A bracket over the letters of one sound: an overline per letter, continuous to the eye.
    let any = false;
    for (const seg of marks.sounds) {
      const letters = word.slice(seg.s, seg.e);
      if (letters === '') continue;
      if (seg.tie) {
        parts.push({ kind: 'sign', text: '‾'.repeat([...letters].length), tone: 'accent', scale: 1 });
        any = true;
      } else gap(letters);
    }
    return any ? parts : null;
  }

  if (lens === 'melody') {
    const { stress, boundary } = marks;
    let rest = word;
    if (stress !== undefined) {
      const { s, e } = stress.vowel;
      if (s >= 0 && e <= word.length && s < e) {
        gap(word.slice(0, s));
        // Bonk's notation with the toneme: ╱ 1, ∨ 2, ˈ a single syllable.
        const sign = stress.toneme === 1 ? '╱' : stress.toneme === 2 ? '∨' : 'ˈ';
        parts.push({
          kind: 'sign',
          text: sign,
          tone: 'accent',
          scale: marks.accent !== undefined ? 1 : 0.75,
        });
        rest = word.slice(e);
      }
    }
    if (boundary !== undefined) {
      gap(rest);
      const arrow =
        boundary.pitch === 'rise' ? '↗' : boundary.pitch === 'fall' ? '↘' : boundary.pitch === 'level' ? '→' : '';
      const pause = boundary.pause === 'long' ? '‖' : boundary.pause === 'short' ? '|' : '';
      if (arrow + pause !== '') {
        parts.push({ kind: 'sign', text: arrow + pause, tone: 'pitch', scale: 0.85 });
      }
    }
    return parts.some((p) => p.kind === 'sign') ? parts : null;
  }

  return null;
}

/** One word of a passage with the text that follows it up to the next word. */
export interface Chunk {
  key: string;
  /** `null` for text before the first word. */
  word: string | null;
  marks: TokenMarks | undefined;
  /** Spaces and punctuation after the word, line breaks taken out. */
  trailing: string;
  /** How many line breaks followed the word. */
  breaks: number;
}

/**
 * The passage cut into words, every character kept once and in order: what each chunk shows,
 * joined, is `text` with its line breaks taken out.
 */
export function chunksOf(
  text: string,
  layer: ProsodyLayer,
  sounds: readonly WordSounds[] = [],
  tokenOffset = 0,
): Chunk[] {
  const marks = marksByStart(text, layer, sounds, tokenOffset);
  const tokens = tokenize(text);
  const gapOf = (from: number, to: number) => {
    const raw = text.slice(from, to);
    return { trailing: raw.replace(/\r?\n/g, ''), breaks: (raw.match(/\n/g) ?? []).length };
  };
  const chunks: Chunk[] = [];
  const first = tokens[0];
  if (first === undefined) {
    return text === '' ? [] : [{ key: 'only', word: null, marks: undefined, ...gapOf(0, text.length) }];
  }
  if (first.s > 0) chunks.push({ key: 'pre', word: null, marks: undefined, ...gapOf(0, first.s) });
  tokens.forEach((token, k) => {
    const next = tokens[k + 1];
    chunks.push({
      key: `w${token.i}`,
      word: token.w,
      marks: marks.get(token.s),
      ...gapOf(token.e, next === undefined ? text.length : next.s),
    });
  });
  return chunks;
}
