import type { AssistCitation, AssistContext } from '../../api/assistant';
import type { Screen } from '../../navigation/screens';
import { canRetry, citationTarget, emphasisSegments, speechLocale } from './assistantLogic';

const thread: Screen = { name: 'Assistant', returnTo: { name: 'Today' } };
const unitCtx: AssistContext = { kind: 'unit', courseId: 'c1', unitId: 'u1' };
const free: AssistContext = { kind: 'free' };

function cite(kind: AssistCitation['kind'], extra: Partial<AssistCitation> = {}): AssistCitation {
  return { kind, id: 'x1', title: 'T', unitId: null, courseId: null, ...extra };
}

describe('citationTarget', () => {
  it('opens a rule from unit material in its own unit, coming back to the thread', () => {
    expect(citationTarget(cite('grammar_rule', { unitId: 'u9', courseId: 'c1' }), free, thread)).toEqual({
      name: 'GrammarRuleReader',
      ruleId: 'x1',
      unitId: 'u9',
      courseId: 'c1',
      returnTo: thread,
    });
  });

  it('lends a rule read on its own the unit open in the context, for the same course only', () => {
    const rule = cite('grammar_rule', { courseId: 'c1' });
    expect(citationTarget(rule, unitCtx, thread)).toMatchObject({ name: 'GrammarRuleReader', unitId: 'u1' });
    expect(citationTarget(cite('grammar_rule', { courseId: 'c2' }), unitCtx, thread)).toBeNull();
    expect(citationTarget(rule, free, thread)).toBeNull();
  });

  it('opens a lesson and a unit', () => {
    expect(citationTarget(cite('lesson', { unitId: 'u1', courseId: 'c1' }), free, thread)).toEqual({
      name: 'LessonReader',
      lessonId: 'x1',
      unitId: 'u1',
      courseId: 'c1',
      returnTo: thread,
    });
    expect(citationTarget(cite('unit', { courseId: 'c1' }), free, thread)).toEqual({
      name: 'UnitContents',
      unitId: 'x1',
      courseId: 'c1',
      returnTo: thread,
    });
  });

  it('opens a course word in its unit, a learner’s own word in My words', () => {
    expect(citationTarget(cite('vocabulary_item', { unitId: 'u1', courseId: 'c1' }), free, thread)).toEqual({
      name: 'UnitContents',
      unitId: 'u1',
      courseId: 'c1',
      returnTo: thread,
    });
    expect(citationTarget(cite('vocabulary_item'), free, thread)).toEqual({ name: 'MyWords', returnTo: thread });
  });

  it('leaves a course word with no unit to be read, not tapped', () => {
    expect(citationTarget(cite('vocabulary_item', { courseId: 'c1' }), free, thread)).toBeNull();
  });
});

describe('emphasisSegments', () => {
  it('cuts the stressed ranges out in order', () => {
    expect(emphasisSegments('Da kom han hjem', [[3, 6]])).toEqual([
      { text: 'Da ', stressed: false },
      { text: 'kom', stressed: true },
      { text: ' han hjem', stressed: false },
    ]);
  });

  it('handles ranges at both ends and none at all', () => {
    expect(emphasisSegments('ab', [[0, 1], [1, 2]])).toEqual([
      { text: 'a', stressed: true },
      { text: 'b', stressed: true },
    ]);
    expect(emphasisSegments('ab', [])).toEqual([{ text: 'ab', stressed: false }]);
  });
});

describe('canRetry', () => {
  it('offers a retry for everything but a refusal', () => {
    expect(canRetry('refused')).toBe(false);
    expect(canRetry('silent')).toBe(true);
    expect(canRetry('rate_limited')).toBe(true);
    expect(canRetry('unreachable')).toBe(true);
  });
});

describe('speechLocale', () => {
  it('listens in the interface language', () => {
    expect(speechLocale('ru')).toBe('ru-RU');
    expect(speechLocale('uk')).toBe('uk-UA');
    expect(speechLocale('no')).toBe('nb-NO');
  });
});
