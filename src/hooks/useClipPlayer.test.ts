import { createClipPlayer, SEQUENCE_GAP_MS, type SoundFactory, type SoundHandle } from './useClipPlayer';

jest.mock('react-native-sound', () => {
  function Sound() {}
  Sound.setCategory = () => undefined;
  return Sound;
});

/** Sounds that load at once and end when the test says so. */
function fakeSounds(failUrls: string[] = []) {
  const played: string[] = [];
  const ends: Array<(ok: boolean) => void> = [];
  const factory: SoundFactory = (url, onLoad) => {
    onLoad(failUrls.includes(url) ? new Error('nope') : null);
    const handle: SoundHandle = {
      play: onEnd => {
        played.push(url);
        ends.push(onEnd);
      },
      stop: () => undefined,
      release: () => undefined,
    };
    return handle;
  };
  return { factory, played, end: () => ends.shift()?.(true) };
}

const flush = () => new Promise<void>(r => setImmediate(r));

describe('createClipPlayer', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('reports a started clip and which one is sounding', async () => {
    const s = fakeSounds();
    const player = createClipPlayer(s.factory);
    const outcome = player.play({ id: 'probe', url: 'a' });
    await flush();
    expect(await outcome).toBe('played');
    expect(player.current()).toBe('probe');
    s.end();
    expect(player.current()).toBeNull();
  });

  it('refuses a clip that cannot be loaded, and a clip with no file', async () => {
    const player = createClipPlayer(fakeSounds(['bad']).factory);
    const outcome = player.play({ id: 'probe', url: 'bad' });
    await flush();
    expect(await outcome).toBe('refused');
    expect(player.current()).toBeNull();
    expect(await player.play({ id: 'x', url: '' })).toBe('refused');
  });

  it('plays a sequence with a gap and skips a later clip that fails', async () => {
    const s = fakeSounds(['b']);
    const player = createClipPlayer(s.factory);
    const outcome = player.sequence([
      { id: '1', url: 'a' },
      { id: '2', url: 'b' },
      { id: '3', url: 'c' },
    ]);
    await flush();
    expect(await outcome).toBe('played');
    s.end();
    jest.advanceTimersByTime(SEQUENCE_GAP_MS);
    await flush();
    jest.advanceTimersByTime(SEQUENCE_GAP_MS);
    await flush();
    expect(s.played).toEqual(['a', 'c']);
  });

  it('is silenced by stop, and a stale end does nothing', async () => {
    const s = fakeSounds();
    const player = createClipPlayer(s.factory);
    void player.play({ id: 'probe', url: 'a' });
    await flush();
    player.stop();
    expect(player.current()).toBeNull();
    s.end();
    expect(player.current()).toBeNull();
  });
});
