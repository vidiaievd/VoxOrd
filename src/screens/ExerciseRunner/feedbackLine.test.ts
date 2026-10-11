import { feedbackLine } from './feedbackLine';

describe('feedbackLine', () => {
  it('drops the engine stock phrases', () => {
    expect(feedbackLine('Correct!')).toEqual({ kind: 'none' });
    expect(feedbackLine('Incorrect. Please try again.')).toEqual({ kind: 'none' });
    expect(feedbackLine('Your answer has been submitted for review.')).toEqual({ kind: 'none' });
    expect(feedbackLine('')).toEqual({ kind: 'none' });
    expect(feedbackLine(undefined)).toEqual({ kind: 'none' });
  });

  it('keeps the answer out of «Expected»', () => {
    expect(feedbackLine('Incorrect. Expected: bor / bodde')).toEqual({
      kind: 'expected',
      answer: 'bor / bodde',
    });
    expect(feedbackLine('Incorrect. Expected: ')).toEqual({ kind: 'none' });
  });

  it('shows the author text as written', () => {
    expect(feedbackLine('Husk inversjon etter «derfor».')).toEqual({
      kind: 'text',
      text: 'Husk inversjon etter «derfor».',
    });
  });
});
