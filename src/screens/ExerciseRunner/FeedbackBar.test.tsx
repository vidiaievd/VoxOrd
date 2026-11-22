import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import type { SubmitAttemptResponse } from '../../api/exercises';
import { translate } from '../../i18n';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { FeedbackBar } from './FeedbackBar';

jest.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ theme: 'dark' }),
}));

const verdict = (over: Partial<SubmitAttemptResponse>): SubmitAttemptResponse => ({
  attemptId: 'a',
  correct: false,
  score: null,
  requiresReview: true,
  feedback: { summary: 'Submitted for review' },
  ...over,
});

function texts(v: SubmitAttemptResponse): string[] {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ThemeProvider>
        <FeedbackBar verdict={v} />
      </ThemeProvider>,
    );
  });
  return tree.root.findAllByType(Text).map(n => [n.props.children].flat().join(''));
}

describe('FeedbackBar for work that goes to review', () => {
  it('promises no review for an answer kept on the phone (plan 90, live check s22, finding 8)', () => {
    const shown = texts(verdict({ onPhone: true }));
    expect(shown).toContain(translate('exerciseRunner.keptForReview'));
    expect(shown).not.toContain(translate('exerciseRunner.sentForReview'));
  });

  it('says a teacher will read it when the server says so', () => {
    expect(texts(verdict({ reviewer: 'teacher' }))).toContain(translate('exerciseRunner.sentForReview'));
  });

  it('says nobody will when the server found no reviewer', () => {
    expect(texts(verdict({ reviewer: 'none' }))).toContain(translate('exerciseRunner.noReviewer'));
  });
});
