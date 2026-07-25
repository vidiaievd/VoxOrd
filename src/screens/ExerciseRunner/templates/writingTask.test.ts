import { buildWritingTaskAnswer, writingTaskCanSubmit, countWords } from './writingTask';

describe('buildWritingTaskAnswer', () => {
  it('wraps the trimmed text without a topic_id when no topic is given', () => {
    expect(buildWritingTaskAnswer('  Kjære redaktør, ...  ', null)).toEqual({
      text: 'Kjære redaktør, ...',
    });
  });

  it('includes topic_id when a topic is selected', () => {
    expect(buildWritingTaskAnswer('Min tekst.', 'topic-1')).toEqual({
      text: 'Min tekst.',
      topic_id: 'topic-1',
    });
  });

  it('returns null for empty/whitespace-only text', () => {
    expect(buildWritingTaskAnswer('', null)).toBeNull();
    expect(buildWritingTaskAnswer('   ', 'topic-1')).toBeNull();
  });
});

describe('writingTaskCanSubmit', () => {
  it('is true once there is non-whitespace text and no topics are required', () => {
    expect(writingTaskCanSubmit('hei', false, null)).toBe(true);
  });

  it('is false for empty or whitespace-only text', () => {
    expect(writingTaskCanSubmit('', false, null)).toBe(false);
    expect(writingTaskCanSubmit('   ', false, null)).toBe(false);
  });

  it('requires a topic to be selected when topics are offered', () => {
    expect(writingTaskCanSubmit('hei', true, null)).toBe(false);
    expect(writingTaskCanSubmit('hei', true, 'topic-1')).toBe(true);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('Familien bor i Bergen.')).toBe(4);
  });

  it('returns 0 for empty/whitespace-only text', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });

  it('collapses multiple spaces between words', () => {
    expect(countWords('hei   på deg')).toBe(3);
  });
});
