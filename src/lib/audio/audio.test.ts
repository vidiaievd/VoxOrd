/**
 * The rules of the listening layer, as the phone holds them — plan 56 phase 7.
 *
 * `model.ts` and `allowance.ts` are mirrored from the kernel (see their headers), and
 * the kernel has its own suite. This one is not a second copy of it: it is the guard on
 * the mirror. If a hand-copy ever lands here half-applied, the exercise would still open
 * and the allowance would quietly be someone else's — so the behaviours the runner
 * actually leans on are pinned here, in this repository, where they run.
 */
import {
  AUDIO_DEFAULT,
  audioOf,
  audioOn,
  canPlay,
  deliveredSegments,
  formatDuration,
  hasHeard,
  INITIAL_STATE,
  isExhausted,
  isGated,
  step,
  type AllowanceContext,
  type AllowanceEvent,
  type AllowanceState,
  type AudioSettings,
} from './index';

const settings = (over: Partial<AudioSettings> = {}): AudioSettings => ({
  ...AUDIO_DEFAULT.settings,
  ...over,
});

const ctx = (over: Partial<AllowanceContext> = {}): AllowanceContext => ({
  settings: settings(),
  duration: 60,
  ...over,
});

function run(events: AllowanceEvent[], context = ctx(), from = INITIAL_STATE): AllowanceState {
  return events.reduce<AllowanceState>(
    (state, event) => step(state, event, context).state,
    from,
  );
}

describe('reading the block off a document', () => {
  it('reads a document with no audio field as switched off', () => {
    // Every exercise the phone has ever played. It must open, and it must be unchanged.
    expect(audioOf({ questions: [] })).toEqual(AUDIO_DEFAULT);
    expect(audioOn({ questions: [] })).toBe(false);
    expect(audioOf(null)).toEqual(AUDIO_DEFAULT);
  });

  it('falls back per field rather than rejecting a half-written block', () => {
    const read = audioOf({ audio: { enabled: true, settings: { plays: 7, layout: 'sideways' } } });
    expect(read.enabled).toBe(true);
    expect(read.settings.plays).toBe(0);
    expect(read.settings.layout).toBe('top');
  });

  it('does not hand out the shared default object', () => {
    audioOf({}).settings.plays = 3;
    expect(AUDIO_DEFAULT.settings.plays).toBe(0);
  });
});

describe('the play allowance', () => {
  it('spends a listen starting from the top, and nothing to resume', () => {
    const limited = ctx({ settings: settings({ plays: 2 }) });

    const started = run([{ type: 'play' }], limited);
    expect(started.plays).toBe(1);

    const resumed = run(
      [{ type: 'time', pos: 12 }, { type: 'pause' }, { type: 'play' }],
      limited,
      started,
    );
    expect(resumed.plays).toBe(1);
    expect(resumed.playing).toBe(true);
  });

  it('refuses a new start once the listens are spent, but lets a paused one finish', () => {
    const limited = ctx({ settings: settings({ plays: 1 }) });

    const paused = run(
      [{ type: 'play' }, { type: 'time', pos: 20 }, { type: 'pause' }],
      limited,
    );
    expect(isExhausted(paused, limited.settings)).toBe(true);
    // The press that resumes is still allowed: a limit that punished pausing would teach
    // learners not to pause rather than to listen (plan 56 §5).
    expect(canPlay(paused, limited)).toBe(true);

    const atTop = run([{ type: 'ended' }], limited, paused);
    expect(canPlay(atTop, limited)).toBe(false);
    expect(step(atTop, { type: 'play' }, limited).effect.transport).toBeNull();
  });

  it('counts a playthrough only when the whole clip ran', () => {
    const heard = run([{ type: 'play' }, { type: 'ended' }]);
    expect(hasHeard(heard)).toBe(true);

    const fragment = run([{ type: 'playRange', start: 10, end: 60 }, { type: 'ended' }]);
    // Heard from 0:10, not from the start.
    expect(hasHeard(fragment)).toBe(false);
  });
});

describe('fragments', () => {
  it('stops at the end of the range, spends no listen and completes nothing', () => {
    const played = run([{ type: 'playRange', start: 10, end: 20 }]);
    expect(played.plays).toBe(0);
    expect(played.range).toEqual({ start: 10, end: 20 });

    // The poll — a phone has no time events, so this is how the end is noticed (§3.10).
    const stopped = step(played, { type: 'time', pos: 20.2 }, ctx());
    expect(stopped.state.playing).toBe(false);
    expect(stopped.state.range).toBeNull();
    expect(stopped.effect.transport).toBe('pause');
    expect(hasHeard(stopped.state)).toBe(false);
  });

  it('does nothing for an inverted range rather than playing the whole clip', () => {
    expect(step(INITIAL_STATE, { type: 'playRange', start: 30, end: 12 }, ctx()).effect).toEqual({
      seekTo: null,
      transport: null,
    });
  });
});

describe('seeking', () => {
  it('is refused outright when the teacher turned it off', () => {
    const locked = ctx({ settings: settings({ seek: false }) });
    expect(step(INITIAL_STATE, { type: 'seek', to: 30 }, locked).state.pos).toBe(0);
  });

  it('clamps to the clip and drops the fragment being played', () => {
    const inRange = run([{ type: 'playRange', start: 10, end: 20 }]);
    const moved = run([{ type: 'seek', to: 999 }], ctx(), inRange);
    expect(moved.pos).toBe(60);
    expect(moved.range).toBeNull();
  });
});

describe('the gate', () => {
  it('opens on one complete listen and never on a fragment', () => {
    const gate = settings({ gate: 'first' });
    expect(isGated(INITIAL_STATE, gate)).toBe(true);

    const afterFragment = run([{ type: 'playRange', start: 5, end: 9 }, { type: 'ended' }]);
    expect(isGated(afterFragment, gate)).toBe(true);

    const afterListen = run([{ type: 'play' }, { type: 'ended' }]);
    expect(isGated(afterListen, gate)).toBe(false);
  });

  it('opens when the clip cannot be played at all', () => {
    // A clip that will not load must never leave the exercise unanswerable (BEHAVIOR §11).
    expect(isGated(INITIAL_STATE, settings({ gate: 'first' }), { playable: false })).toBe(false);
  });
});

describe('what the wire carries', () => {
  it('reads the timecodes gathered onto the block by the projection', () => {
    expect(
      deliveredSegments({ audio: { segments: { 'q-1': { start: 4, end: 9 }, 'q-2': {} } } }),
    ).toEqual({ 'q-1': { start: 4, end: 9 } });
    expect(deliveredSegments({ questions: [] })).toEqual({});
  });

  it('prints the one time format the player and the fragment chip share', () => {
    expect(formatDuration(96)).toBe('1:36');
    expect(formatDuration(0)).toBe('0:00');
  });
});
