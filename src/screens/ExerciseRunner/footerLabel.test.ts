import { footerLabelKey } from './footerLabel';

describe('footerLabelKey', () => {
  it('hands in writing, error correction and translation', () => {
    for (const code of ['writing_task', 'error_correction', 'translate']) {
      expect(footerLabelKey(code, false)).toBe('exerciseRunner.send');
    }
  });

  it('names the teacher when the body offers the model rehearsal, so the two buttons differ', () => {
    for (const code of ['writing_task', 'error_correction', 'translate']) {
      expect(footerLabelKey(code, true)).toBe('exerciseRunner.sendToTeacher');
    }
  });

  it('keeps Check for items checked on the spot', () => {
    expect(footerLabelKey('multiple_choice', false)).toBe('exerciseRunner.check');
    expect(footerLabelKey('fill_in_blank', true)).toBe('exerciseRunner.check');
  });
});
