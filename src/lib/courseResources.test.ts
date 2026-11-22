jest.mock('@react-native-async-storage/async-storage', () => ({
  createAsyncStorage: () => ({ getItem: jest.fn(), setItem: jest.fn() }),
}));

import {
  exerciseDisplayResource,
  grammarRuleResource,
  lessonReaderResource,
} from './courseResources';

// A unit downloaded under one interface language must still open offline after the learner
// switches the app's language (live check s23, finding 9): each language-keyed resource
// names the same material under every other interface language.
describe('fallbackKeys', () => {
  it('exercise display: the other interface languages, never its own key', () => {
    const resource = exerciseDisplayResource('ex-1', 'ru');
    expect(resource.key).toBe('exercise-display:ex-1:ru');
    expect(resource.fallbackKeys).toEqual(['exercise-display:ex-1:uk', 'exercise-display:ex-1:en']);
  });

  it('lesson reader and grammar rule keep course and id in every key', () => {
    expect(lessonReaderResource('l-1', 'c-1', 'uk').fallbackKeys).toEqual([
      'lesson-reader:l-1:c-1:ru',
      'lesson-reader:l-1:c-1:en',
    ]);
    expect(grammarRuleResource('r-1', 'c-1', 'en').fallbackKeys).toEqual([
      'grammar-rule-reader:r-1:c-1:ru',
      'grammar-rule-reader:r-1:c-1:uk',
    ]);
  });
});
