import { useCallback } from 'react';
import { getContainer } from '../api/courses';
import { getGrammarRuleExplanation, GrammarRuleExplanation } from '../api/grammarRules';
import { useSettings } from './useSettings';
import { useSwrResource } from './useSwrResource';

export interface GrammarRuleReaderState {
  status: 'loading' | 'loaded' | 'error';
  data: GrammarRuleExplanation | null;
  error: Error | null;
  /** True while `data` is a cached value shown ahead of (or instead of, on failure) a fresh fetch. */
  stale: boolean;
  refresh: () => Promise<void>;
}

/**
 * Resolves the course's CEFR level (from its container) alongside the app's
 * UI language as the student's native language — same resolution
 * `useLessonReader` uses, since there's no student-profile service on mobile
 * yet to supply these directly.
 */
export function useGrammarRuleReader(ruleId: string, courseId: string): GrammarRuleReaderState {
  const { uiLanguage } = useSettings();
  const loader = useCallback(async () => {
    const container = await getContainer(courseId);
    return getGrammarRuleExplanation(ruleId, {
      studentNativeLanguage: uiLanguage,
      studentCurrentLevel: container.difficultyLevel,
    });
  }, [ruleId, courseId, uiLanguage]);

  const { status, data, error, stale, refresh } = useSwrResource<GrammarRuleExplanation>(
    `grammar-rule-reader:${ruleId}:${courseId}:${uiLanguage}`,
    loader,
  );

  return { status, data, error, stale, refresh };
}
