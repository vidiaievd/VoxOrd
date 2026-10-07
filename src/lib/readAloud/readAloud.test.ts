/**
 * The recorder's rules, as the phone holds them — plan 70, phase 10.
 *
 * `model.ts`, `limits.ts`, `recorder.ts` and `submission.ts` are mirrored from the kernel (see
 * their headers), and the kernel has its own suite. This one is the guard on the mirror: if a
 * hand-copy ever lands here half-applied, a take could be spent by a phone call or handed in
 * short, and nothing would say so. The behaviours the runner leans on are pinned here, in this
 * repository, where they run.
 */
import {
  canSubmit,
  chosenTake,
  initialState,
  left,
  LIMITS,
  recordLimit,
  reduce,
  submitBlock,
  takesOf,
  toDraft,
  toSubmission,
  unsentAssets,
  readDraft,
  type RecorderConfig,
  type RecorderEvent,
  type RecorderState,
} from './index';
import { DEFAULT_RECORDING } from './model';

const config = (
  over: Partial<RecorderConfig['recording']> = {},
): RecorderConfig => ({
  prompts: [
    { id: 'p1', minSeconds: 5, maxSeconds: 30, prepSeconds: 2 },
    { id: 'p2', minSeconds: 5, maxSeconds: 30, prepSeconds: 0 },
  ],
  recording: { ...DEFAULT_RECORDING, countdown: false, ...over },
});

function run(
  events: RecorderEvent[],
  c = config(),
  from?: RecorderState,
): RecorderState {
  return events.reduce((s, e) => reduce(s, e, c), from ?? initialState(c));
}

/** One take at the prompt on screen: begin, (prep), record, stop, the adapter answers. */
function take(seconds: number, ref: string): RecorderEvent[] {
  return [
    { type: 'begin' },
    { type: 'startNow' },
    { type: 'stop' },
    { type: 'stopped', ref, seconds },
  ];
}

describe('read_aloud recorder (mirror)', () => {
  it('starts on the level check, and «Klar» passes it', () => {
    const s = run([]);
    expect(s.phase).toBe('mic');
    expect(run([{ type: 'ready' }]).phase).toBe('idle');
  });

  it('records a take into review, pending upload', () => {
    const s = run([{ type: 'ready' }, ...take(12, '/cache/a.m4a')]);
    expect(s.phase).toBe('review');
    expect(takesOf(s, 'p1')).toEqual([
      {
        n: 1,
        seconds: 12,
        ref: '/cache/a.m4a',
        assetId: null,
        upload: 'pending',
      },
    ]);
  });

  it('stops a take on its own at the prompt maximum', () => {
    const c = config();
    let s = run(
      [{ type: 'ready' }, { type: 'begin' }, { type: 'startNow' }],
      c,
    );
    expect(s.phase).toBe('rec');
    for (let i = 0; i < 30; i++) s = reduce(s, { type: 'tick' }, c);
    expect(s.phase).toBe('stopping');
  });

  it('never lets a prompt run past the hard ceiling', () => {
    expect(LIMITS.hardMaxSeconds).toBe(180);
    expect(recordLimit(600)).toBe(180);
  });

  it('spends no take on an interruption (§8 item 4)', () => {
    const s = run([
      { type: 'ready' },
      { type: 'begin' },
      { type: 'startNow' },
      { type: 'interrupted' },
    ]);
    expect(s.phase).toBe('idle');
    expect(s.notice).toBe('interrupted');
    expect(left(s, config(), 'p1')).toBe(3);
  });

  it('gives a refused take its slot back (decided 06.10)', () => {
    const c = config({ takes: 1 });
    let s = run([{ type: 'ready' }, ...take(12, '/a')], c);
    expect(left(s, c, 'p1')).toBe(0);
    s = reduce(s, { type: 'uploaded', itemId: 'p1', n: 1, assetId: 'as-1' }, c);
    s = reduce(s, { type: 'refused', itemId: 'p1', n: 1 }, c);
    expect(left(s, c, 'p1')).toBe(1);
    expect(takesOf(s, 'p1')).toEqual([]);
  });

  it('blocks the hand-in until every prompt has an uploaded take long enough', () => {
    const c = config();
    let s = run([{ type: 'ready' }, ...take(12, '/a')], c);
    expect(submitBlock(s, c)).toBe('unrecorded');
    s = run([{ type: 'goto', index: 1 }, ...take(3, '/b')], c, s);
    expect(submitBlock(s, c)).toBe('short');
    s = run(
      [
        { type: 'begin' },
        { type: 'stop' },
        { type: 'stopped', ref: '/c', seconds: 9 },
      ],
      c,
      s,
    );
    expect(submitBlock(s, c)).toBe('uploading');
    s = run(
      [
        { type: 'uploaded', itemId: 'p1', n: 1, assetId: 'a1' },
        { type: 'uploaded', itemId: 'p2', n: 1, assetId: 'b1' },
        { type: 'uploaded', itemId: 'p2', n: 2, assetId: 'b2' },
      ],
      c,
      s,
    );
    expect(canSubmit(s, c)).toBe(true);
  });

  it('hands in the chosen take only, and names the rest for deletion', () => {
    const c = config();
    let s = run([{ type: 'ready' }, ...take(12, '/a'), ...take(14, '/b')], c);
    s = run(
      [
        { type: 'uploaded', itemId: 'p1', n: 1, assetId: 'a1' },
        { type: 'uploaded', itemId: 'p1', n: 2, assetId: 'a2' },
        { type: 'choose', index: 0 },
        { type: 'goto', index: 1 },
        ...take(9, '/c'),
        { type: 'uploaded', itemId: 'p2', n: 1, assetId: 'b1' },
      ],
      c,
      s,
    );
    expect(chosenTake(s, c, 'p1')?.assetId).toBe('a1');
    const submission = toSubmission(s, c);
    expect(submission).toEqual({
      recordings: [
        { itemId: 'p1', assetId: 'a1', seconds: 12, takes: 2 },
        { itemId: 'p2', assetId: 'b1', seconds: 9, takes: 1 },
      ],
    });
    expect(unsentAssets(s, submission!)).toEqual(['a2']);
  });

  it('keeps only uploaded takes on the draft, and restores them', () => {
    const c = config();
    let s = run([{ type: 'ready' }, ...take(12, '/a'), ...take(14, '/b')], c);
    s = reduce(s, { type: 'uploaded', itemId: 'p1', n: 2, assetId: 'a2' }, c);
    const draft = toDraft(s);
    expect(draft).toEqual({
      takes: { p1: [{ n: 2, assetId: 'a2', seconds: 14 }] },
      chosen: {},
    });

    const back = readDraft(JSON.parse(JSON.stringify(draft)));
    const restored = reduce(initialState(c), { type: 'restore', ...back }, c);
    expect(restored.phase).toBe('idle');
    expect(takesOf(restored, 'p1')).toEqual([
      { n: 1, seconds: 14, ref: null, assetId: 'a2', upload: 'done' },
    ]);
  });
});
