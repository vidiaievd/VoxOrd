import React from 'react';
import { useTranslation } from '../../i18n';
import { AnswerFeedback, IconName } from '../../components/ui';
import type { SubmitAttemptResponse } from '../../api/exercises';
import { isPassedVerdict } from '../../lib/mistakes';
import { feedbackLine } from './feedbackLine';

interface FeedbackBarProps {
  verdict: SubmitAttemptResponse;
}

type FeedbackTone = 'correct' | 'passed' | 'incorrect' | 'review' | 'unread' | 'ai' | 'onPhone';

function toneFor(verdict: SubmitAttemptResponse): FeedbackTone {
  // Free-form templates (translate_*, writing_task) route to human review:
  // don't present them as right/wrong. With nobody to review them (plan 79, step 2.1c)
  // «submitted for review» would be a promise no one keeps; with a model to read them
  // (plan 79, step 2.3d) the verdict follows in seconds, above the bar, not from a teacher.
  if (verdict.requiresReview) {
    // Kept on the phone: who reads it is known only once the server takes it.
    if (verdict.onPhone) return 'onPhone';
    if (verdict.reviewer === 'none') return 'unread';
    return verdict.reviewer === 'ai' ? 'ai' : 'review';
  }
  if (verdict.correct) return 'correct';
  // Not every item right, but over the pass mark: it counted, so it is not «Incorrect».
  return isPassedVerdict(verdict) ? 'passed' : 'incorrect';
}

const ICON: Record<FeedbackTone, IconName> = {
  correct: 'CheckCircle',
  passed: 'CheckCircle',
  incorrect: 'Info',
  review: 'PaperPlaneRight',
  unread: 'Info',
  ai: 'Sparkle',
  onPhone: 'DeviceMobile',
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
      : tone === 'passed'
      ? t('exerciseRunner.passedWithMistakes')
      : tone === 'incorrect'
      ? line.kind === 'expected'
        ? t('exerciseRunner.expectedAnswer', { answer: line.answer })
        : t('exerciseRunner.incorrect')
      : tone === 'unread'
      ? t('exerciseRunner.noReviewer')
      : tone === 'ai'
      ? t('exerciseRunner.aiHandedIn')
      : tone === 'onPhone'
      ? t('exerciseRunner.keptForReview')
      : t('exerciseRunner.sentForReview');
  const body =
    tone === 'unread'
      ? text ?? t('exerciseRunner.noReviewerNote')
      : tone === 'ai'
      ? text ?? t('exerciseRunner.aiHandedInNote')
      : tone === 'passed' && line.kind === 'expected'
      ? t('exerciseRunner.expectedAnswer', { answer: line.answer })
      : text;

  return <AnswerFeedback icon={ICON[tone]} title={title} body={body} />;
}
