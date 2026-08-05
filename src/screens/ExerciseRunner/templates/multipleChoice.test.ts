import { buildMcqAnswer, extractCorrectOptionIds, mcqCanSubmit } from './multipleChoice';

describe('buildMcqAnswer', () => {
  it('wraps the selected id in correct_option_ids', () => {
    expect(buildMcqAnswer('b')).toEqual({ correct_option_ids: ['b'] });
  });

  it('returns null when nothing is selected', () => {
    expect(buildMcqAnswer(null)).toBeNull();
  });
});

describe('mcqCanSubmit', () => {
  it('is true once an option is selected', () => {
    expect(mcqCanSubmit('a')).toBe(true);
  });

  it('is false with no selection', () => {
    expect(mcqCanSubmit(null)).toBe(false);
  });
});

describe('extractCorrectOptionIds', () => {
  it('reads correct_option_ids from a well-formed correctAnswer', () => {
    expect(extractCorrectOptionIds({ correct_option_ids: ['b'], explanation: 'x' })).toEqual([
      'b',
    ]);
  });

  it('returns null for missing/malformed shapes', () => {
    expect(extractCorrectOptionIds(null)).toBeNull();
    expect(extractCorrectOptionIds(undefined)).toBeNull();
    expect(extractCorrectOptionIds('b')).toBeNull();
    expect(extractCorrectOptionIds({ correct_option_ids: 'b' })).toBeNull();
    expect(extractCorrectOptionIds({})).toBeNull();
  });
});
