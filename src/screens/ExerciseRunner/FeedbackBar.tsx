import React from 'react';
import { useTranslation } from '../../i18n';
import { AnswerFeedback, IconName } from '../../components/ui';
import type { SubmitAttemptResponse } from '../../api/exercises';
import { feedbackLine } from './feedbackLine';

interface FeedbackBarProps {
  verdict: SubmitAttemptResponse;
}

type FeedbackTone = 'correct' | 'incorrect' | 'review' | 'unread' | 'ai';

function toneFor(verdict: SubmitAttemptResponse): FeedbackTone {
  // Free-form templates (translate_*, writing_task) route to human review:
  // don't present them as right/wrong. With nobody to review them (plan 79, step 2.1c)
  // «submitted for review» would be a promise no one keeps; with a model to read them
  // (plan 79, step 2.3d) the verdict follows in seconds, above the bar, not from a teacher.
  if (verdict.requiresReview) {
    if (verdict.reviewer === 'none') return 'unread';
    return verdict.reviewer === 'ai' ? 'ai' : 'review';
  }
  return verdict.correct ? 'correct' : 'incorrect';
}

const ICON: Record<FeedbackTone, IconName> = {
  correct: 'CheckCircle',
  incorrect: 'Info',
  review: 'PaperPlaneRight',
  unread: 'Info',
  ai: 'Sparkle',
};

/**
 * The verdict over the footer button (Courses §8.5): «Верно», or «Правильно: {answer}» when
 * the engine named the answer. No green or red — the icon and the words carry it.
 */
export function FeedbackBar({ verdict }: FeedbackBarProps) {
  const { t } = useTranslation();

  const tone = toneFor(verdict);
  // The engine's own words are English stock phrases; see `feedbackLine`.
  const line = feedbackLine(verdict.feedback.summary);
  const text = line.kind === 'text' ? line.text : null;

  const title =
    tone === 'correct'
      ? t('exerciseRunner.correct')
      : tone === 'incorrect'
      ? line.kind === 'expected'
        ? t('exerciseRunner.expectedAnswer', { answer: line.answer })
        : t('exerciseRunner.incorrect')
      : tone === 'unread'
      ? t('exerciseRunner.noReviewer')
      : tone === 'ai'
      ? t('exerciseRunner.aiHandedIn')
      : t('exerciseRunner.sentForReview');
  const body =
    tone === 'unread'
      ? text ?? t('exerciseRunner.noReviewerNote')
      : tone === 'ai'
      ? text ?? t('exerciseRunner.aiHandedInNote')
      : text;

  return <AnswerFeedback icon={ICON[tone]} title={title} body={body} />;
}
