import { ApiError } from '../../api/client';
import { translate, translateIn } from '../../i18n';
import { runnerErrorMessage } from './errorMessage';

describe('runnerErrorMessage', () => {
  it("names a network failure in the learner's words, not the transport's", () => {
    const e = new ApiError({ message: 'Network request failed', status: null, code: 'NETWORK_ERROR' });
    expect(runnerErrorMessage(e)).toBe(translate('exerciseRunner.notOnPhone'));
    expect(runnerErrorMessage(e)).not.toMatch(/Network request failed/);
    expect(translateIn('uk', 'exerciseRunner.notOnPhone')).toMatch(/^Немає мережі/);
  });

  it('says why a read-only school refused', () => {
    const e = new ApiError({ message: 'School not active', status: 409, code: 'SCHOOL_NOT_ACTIVE' });
    expect(runnerErrorMessage(e)).toBe(translate('schoolLifecycle.schoolSuspended'));
  });

  it('keeps any other error as it came', () => {
    expect(runnerErrorMessage(new ApiError({ message: 'Bad answer', status: 422, code: null }))).toBe('Bad answer');
  });
});
