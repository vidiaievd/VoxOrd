import { footerButtonShown, footerLabelKey } from './footerLabel';

const HANDED_IN = ['writing_task', 'error_correction', 'translate'];

describe('footerLabelKey', () => {
  it('hands in writing, error correction and translation at a school', () => {
    for (const code of HANDED_IN) {
      expect(footerLabelKey(code, { precheckAvailable: false, schoolLearner: true })).toBe('exerciseRunner.send');
    }
  });

  it('names the teacher when the body offers the model rehearsal, so the two buttons differ', () => {
    for (const code of HANDED_IN) {
      expect(footerLabelKey(code, { precheckAvailable: true, schoolLearner: true })).toBe(
        'exerciseRunner.sendToTeacher',
      );
    }
  });

  it('only finishes the work of a learner on their own', () => {
    for (const code of HANDED_IN) {
      expect(footerLabelKey(code, { precheckAvailable: false, schoolLearner: false })).toBe('exerciseRunner.done');
    }
  });

  it('keeps Check for items checked on the spot', () => {
    expect(footerLabelKey('multiple_choice', { precheckAvailable: false, schoolLearner: false })).toBe(
      'exerciseRunner.check',
    );
    expect(footerLabelKey('fill_in_blank', { precheckAvailable: true, schoolLearner: true })).toBe(
      'exerciseRunner.check',
    );
  });
});

describe('footerButtonShown', () => {
  it('leaves out a hand-in that cannot be made yet', () => {
    for (const code of HANDED_IN) expect(footerButtonShown(code, false, false)).toBe(false);
  });

  it('draws the hand-in once it can be made, and while it is going', () => {
    expect(footerButtonShown('writing_task', true, false)).toBe(true);
    expect(footerButtonShown('translate', false, true)).toBe(true);
  });

  it('keeps a dimmed Check for items checked on the spot', () => {
    expect(footerButtonShown('multiple_choice', false, false)).toBe(true);
  });
});
