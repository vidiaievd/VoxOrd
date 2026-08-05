import {
  blankIdsFromSegments,
  buildFillInBlankAnswer,
  extractExpectedBlankAnswers,
  fillInBlankCanSubmit,
  parseTextWithBlanks,
} from './fillInBlank';

describe('parseTextWithBlanks', () => {
  it('splits text around a single blank', () => {
    expect(parseTextWithBlanks('Jeg ___1___ norsk')).toEqual([
      { type: 'text', value: 'Jeg ' },
      { type: 'blank', id: 1 },
      { type: 'text', value: ' norsk' },
    ]);
  });

  it('handles multiple blanks in order', () => {
    const segments = parseTextWithBlanks(
      'I går ___1___ (å spise) vi middag, og så ___2___ (å se) vi på tv.',
    );
    expect(blankIdsFromSegments(segments)).toEqual([1, 2]);
    expect(segments[0]).toEqual({ type: 'text', value: 'I går ' });
  });

  it('handles a blank at the very start or end with no surrounding text', () => {
    expect(parseTextWithBlanks('___1___ er bra')).toEqual([
      { type: 'blank', id: 1 },
      { type: 'text', value: ' er bra' },
    ]);
    expect(parseTextWithBlanks('Det er ___1___')).toEqual([
      { type: 'text', value: 'Det er ' },
      { type: 'blank', id: 1 },
    ]);
  });

  it('returns a single text segment when there are no blanks', () => {
    expect(parseTextWithBlanks('no blanks here')).toEqual([
      { type: 'text', value: 'no blanks here' },
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTextWithBlanks('')).toEqual([]);
  });
});

describe('fillInBlankCanSubmit / buildFillInBlankAnswer', () => {
  it('cannot submit until every blank has a non-empty value', () => {
    expect(fillInBlankCanSubmit({ 1: 'spiste' }, [1, 2])).toBe(false);
    expect(fillInBlankCanSubmit({ 1: 'spiste', 2: '  ' }, [1, 2])).toBe(false);
    expect(fillInBlankCanSubmit({ 1: 'spiste', 2: 'så' }, [1, 2])).toBe(true);
  });

  it('is false for a set with no blanks at all', () => {
    expect(fillInBlankCanSubmit({}, [])).toBe(false);
  });

  it('builds one entry per blank with a trimmed single-element accepted_answers', () => {
    const answer = buildFillInBlankAnswer({ 1: '  spiste  ', 2: 'så' }, [1, 2]);
    expect(answer).toEqual({
      blanks: [
        { blank_id: 1, accepted_answers: ['spiste'] },
        { blank_id: 2, accepted_answers: ['så'] },
      ],
    });
  });

  it('returns null when not submittable', () => {
    expect(buildFillInBlankAnswer({ 1: '' }, [1])).toBeNull();
  });
});

describe('extractExpectedBlankAnswers', () => {
  it('maps blank_id to the first accepted answer', () => {
    const map = extractExpectedBlankAnswers({
      blanks: [
        { blank_id: 1, accepted_answers: ['spiste'] },
        { blank_id: 2, accepted_answers: ['så', 'saa'] },
      ],
      explanation: 'x',
    });
    expect(map).toEqual({ 1: 'spiste', 2: 'så' });
  });

  it('returns null for malformed shapes', () => {
    expect(extractExpectedBlankAnswers(null)).toBeNull();
    expect(extractExpectedBlankAnswers({})).toBeNull();
    expect(extractExpectedBlankAnswers({ blanks: 'nope' })).toBeNull();
  });
});
