import { useMemo } from 'react';
import type { GrammarRuleExplanation } from '../api/grammarRules';
import { grammarRuleResource } from '../lib/courseResources';
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
  const resource = useMemo(
    () => grammarRuleResource(ruleId, courseId, uiLanguage),
    [ruleId, courseId, uiLanguage],
  );
  const { status, data, error, stale, refresh } = useSwrResource<GrammarRuleExplanation>(
    resource.key,
    resource.load,
  );

  return { status, data, error, stale, refresh };
}
