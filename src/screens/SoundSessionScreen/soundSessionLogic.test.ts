import type { SessionStep } from '../../api/soundSession';
import {
  eventLine,
  familyOf,
  isFramed,
  isSoundAtomId,
  lowBudget,
  pairNow,
  promptOf,
  toneKeyOf,
} from './soundSessionLogic';

const drill = (element: Extract<SessionStep, { phase: 'drill' }>['element'], say: string | null = null): SessionStep => ({
  phase: 'drill',
  atomId: 'nb:kj',
  family: 'kj',
  elementIndex: 0,
  element,
  say,
  sentence: 'Nå sier jeg x igjen.',
  fails: 0,
});

describe('soundSessionLogic', () => {
  it('names the family and checks the id', () => {
    expect(familyOf('nb:kj')).toBe('kj');
    expect(isSoundAtomId('nb:kj')).toBe(true);
    expect(isSoundAtomId('nb:kj; drop')).toBe(false);
  });

  it('warns only a metered learner whose rest is under the estimate', () => {
    const base = { payer: 'learner', metered: true, remainingCredits: 10, estimatedCredits: 35 } as const;
    expect(lowBudget(base)).toBe(true);
    expect(lowBudget({ ...base, remainingCredits: 40 })).toBe(false);
    expect(lowBudget({ ...base, payer: 'school' })).toBe(false);
    expect(lowBudget({ ...base, metered: false })).toBe(false);
    expect(lowBudget({ ...base, remainingCredits: null })).toBe(false);
    expect(lowBudget(null)).toBe(false);
  });

  it('asks for a word, a pair or a phrase', () => {
    expect(promptOf(drill({ kind: 'word', word: 'kyss' }))).toEqual({ key: 'sayWord', target: 'kyss' });
    expect(promptOf(drill({ kind: 'pair', words: ['a', 'b'], judged: [] }, 'a'))).toEqual({ key: 'sayPair', target: 'a  /  b' });
    expect(promptOf(drill({ kind: 'phrase', text: 'Hei' }))).toEqual({ key: 'sayPhrase', target: 'Hei' });
    expect(
      promptOf({ phase: 'diagnostic', atomId: 'nb:y', family: 'y', index: 0, total: 8, word: 'by', sentence: 's' }),
    ).toEqual({ key: 'sayWord', target: 'by' });
  });

  it('frames words and pairs, not phrases; knows which half of a pair is up', () => {
    expect(isFramed(drill({ kind: 'word', word: 'x' }))).toBe(true);
    expect(isFramed(drill({ kind: 'phrase', text: 'x' }))).toBe(false);
    expect(pairNow(drill({ kind: 'pair', words: ['a', 'b'], judged: [] }, 'b'))).toBe('b');
    expect(pairNow(drill({ kind: 'word', word: 'x' }, 'x'))).toBeNull();
  });

  it('picks the strongest news', () => {
    expect(eventLine([])).toBeNull();
    expect(
      eventLine([
        { kind: 'element_passed', atomId: 'a' },
        { kind: 'sound_failed', atomId: 'a' },
      ]),
    ).toBe('sound_failed');
    expect(eventLine([{ kind: 'retry', atomId: 'a' }])).toBeNull();
  });

  it('keeps only the toneme verdicts it has words for', () => {
    expect(toneKeyOf('other_tone')).toBe('other_tone');
    expect(toneKeyOf('weird')).toBeNull();
    expect(toneKeyOf(undefined)).toBeNull();
  });
});
