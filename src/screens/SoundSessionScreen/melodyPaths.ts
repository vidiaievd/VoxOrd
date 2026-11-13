import type { Melody } from '../../api/soundSession';

export const CHART_W = 320;
export const CHART_H = 120;
const PAD = 8;

/** Runs of consecutive voiced samples as `M x y L x y …`; a gap in the voice is a gap in the line. */
function runs(
  curve: ReadonlyArray<number | null>,
  x: (i: number) => number,
  y: (v: number) => number,
): string[] {
  const out: string[] = [];
  let run: string[] = [];
  curve.forEach((v, i) => {
    if (v === null) {
      if (run.length > 1) out.push(run.join(' '));
      run = [];
      return;
    }
    run.push(`${run.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
  });
  if (run.length > 1) out.push(run.join(' '));
  return out;
}

/**
 * The learner's and the model's pitch on one scale. Each line is stretched over the width of the
 * word — the question is the shape of the melody, not how long it took. `null` — nothing to draw.
 */
export function melodyPaths(melody: Melody): { yours: string[]; model: string[] } | null {
  const all = [...melody.learner, ...melody.reference].filter((v): v is number => v !== null);
  if (all.length < 2) return null;
  const lo = Math.min(...all);
  const span = Math.max(...all) - lo || 1;
  const y = (v: number) => CHART_H - PAD - ((v - lo) / span) * (CHART_H - 2 * PAD);
  const xOf = (n: number) => (i: number) =>
    PAD + (n <= 1 ? 0 : (i / (n - 1)) * (CHART_W - 2 * PAD));
  return {
    yours: runs(melody.learner, xOf(melody.learner.length), y),
    model: runs(melody.reference, xOf(melody.reference.length), y),
  };
}
