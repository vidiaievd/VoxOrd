import {
  INITIAL_SITTING,
  estimatedMinutes,
  readMinimalPairsProjection,
  readMinimalPairsSummary,
  readProbe,
  readProbeVerdict,
  sittingReducer,
  type Probe,
} from './minimalPairs';

const projection = {
  title: 'kj / sj',
  instruction: 'Trykk på ordet du hørte.',
  language: 'nb',
  contrast: { label: 'kj / sj', ipa: 'ç ~ ʃ' },
  set: { probes: 8, playsPerProbe: 2, autoplay: true },
  feedback: { immediate: true, abCompare: true, showSpelling: 'afterAnswer' },
};

const probe = (over: Record<string, unknown> = {}) => ({
  n: 1,
  total: 8,
  questionId: 'p1',
  clip: { url: 'https://cdn/a.mp3', expiresAt: 'x', durationMs: 700, provenance: 'tts' },
  options: [{ id: 'o1' }, { id: 'o2' }],
  state: { tries: 0, maxTries: 2, closed: false },
  closedProbes: [],
  ...over,
});

describe('readMinimalPairsProjection', () => {
  it('reads the student projection', () => {
    const p = readMinimalPairsProjection(projection);
    expect(p?.set).toEqual({ probes: 8, playsPerProbe: 2, autoplay: true });
    expect(p?.feedback.showGloss).toBe('afterAnswer');
  });

  it.each(['pairs', 'scoring', 'passPct', 'contrastId', 'note'])(
    'refuses a document carrying %s',
    key => {
      expect(readMinimalPairsProjection({ ...projection, [key]: 1 })).toBeNull();
    },
  );

  it('reads an out-of-range budget as two, never as unlimited', () => {
    const p = readMinimalPairsProjection({ ...projection, set: { probes: 3, playsPerProbe: 9 } });
    expect(p?.set.playsPerProbe).toBe(2);
  });

  it('keeps unlimited when the author chose it', () => {
    const p = readMinimalPairsProjection({ ...projection, set: { probes: 3, playsPerProbe: 0 } });
    expect(p?.set.playsPerProbe).toBe(0);
  });

  it('refuses a set without a probe count', () => {
    expect(readMinimalPairsProjection({ ...projection, set: {} })).toBeNull();
  });
});

describe('readProbe', () => {
  it('reads a probe', () => {
    const p = readProbe(probe());
    expect(p?.questionId).toBe('p1');
    expect(p?.clip.provenance).toBe('tts');
  });

  it('refuses a probe that names its key', () => {
    expect(readProbe(probe({ keyOptionId: 'o1' }))).toBeNull();
    expect(readProbe(probe({ wordId: 'w1' }))).toBeNull();
  });

  it('refuses a probe with no clip or fewer than two buttons', () => {
    expect(readProbe(probe({ clip: { url: '' } }))).toBeNull();
    expect(readProbe(probe({ options: [{ id: 'o1' }] }))).toBeNull();
  });
});

describe('readProbeVerdict', () => {
  const base = {
    questionId: 'p1',
    n: 1,
    optionId: 'o1',
    correct: false,
    tries: 1,
    triesLeft: 1,
    firstCorrect: false,
  };

  it('does not read the key of an open probe even if sent', () => {
    const v = readProbeVerdict({ ...base, closed: false, keyOptionId: 'o2' });
    expect(v?.keyOptionId).toBeUndefined();
  });

  it('reads the key, the spellings and the comparison of a closed one', () => {
    const v = readProbeVerdict({
      ...base,
      closed: true,
      keyOptionId: 'o2',
      options: [{ id: 'o2', text: 'sjø' }],
      compare: { chosen: 'a', target: 'b' },
    });
    expect(v?.keyOptionId).toBe('o2');
    expect(v?.options?.[0]?.text).toBe('sjø');
    expect(v?.compare).toEqual({ chosen: 'a', target: 'b' });
  });
});

describe('readMinimalPairsSummary', () => {
  it('reads the result with its pairs', () => {
    const s = readMinimalPairsSummary({
      right: 6,
      total: 8,
      score: 75,
      passed: true,
      passPct: 70,
      memory: 'contrast+word',
      pairs: [{ pairId: 'a', words: ['kje', 'sje'], played: 4, correct: 3, clips: ['u', null] }],
    });
    expect(s?.pairs[0]?.clips).toEqual(['u', '']);
    expect(s?.memory).toBe('contrast+word');
  });

  it('refuses a body that is not a result', () => {
    expect(readMinimalPairsSummary({ right: 1 })).toBeNull();
  });
});

describe('estimatedMinutes', () => {
  it('is a quarter minute a probe, never under one', () => {
    expect(estimatedMinutes(2)).toBe(1);
    expect(estimatedMinutes(20)).toBe(5);
  });
});

describe('sittingReducer', () => {
  const handed = (over: Record<string, unknown> = {}): Probe => readProbe(probe(over)) as Probe;

  it('restores the pips and a spent try after a reload', () => {
    const s = sittingReducer(INITIAL_SITTING, {
      type: 'handed',
      probe: handed({
        n: 3,
        closedProbes: [{ n: 1, correct: true }, { n: 2, correct: false }],
        state: { tries: 1, maxTries: 2, closed: false },
      }),
    });
    expect(s.pips).toEqual({ 1: true, 2: false });
    expect(s.retried).toBe(true);
  });

  it('pips the first answer, not the last', () => {
    let s = sittingReducer(INITIAL_SITTING, { type: 'handed', probe: handed() });
    s = sittingReducer(s, {
      type: 'closed',
      verdict: readProbeVerdict({
        questionId: 'p1',
        n: 1,
        optionId: 'o2',
        correct: true,
        closed: true,
        tries: 2,
        triesLeft: 0,
        firstCorrect: false,
      })!,
    });
    expect(s.pips[1]).toBe(false);
  });

  it('leaves the probe where it was when an answer fails', () => {
    let s = sittingReducer(INITIAL_SITTING, { type: 'handed', probe: handed() });
    s = sittingReducer(s, { type: 'failed', failure: 'answer' });
    expect(s.phase).toBe('probe');
    s = sittingReducer(s, { type: 'failed', failure: 'finish' });
    expect(s.phase).toBe('failed');
  });
});
