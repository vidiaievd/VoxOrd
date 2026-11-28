import { ApiError } from '../../api/client';
import { translate, translateIn } from '../../i18n';
import { runnerErrorMessage, stepSendError } from './errorMessage';

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

describe('stepSendError', () => {
  const t = (path: string) => translate(path);
  const scope = 'exerciseRunner.multipleChoice';

  it('words a read-only school, not "try again"', () => {
    const e = new ApiError({
      message: 'school',
      status: 409,
      body: { code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' },
    });
    expect(stepSendError(e, t, scope)).toBe(translate('schoolLifecycle.schoolSuspended'));
    const closed = new ApiError({ message: 'school', status: 409, body: { code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'closed' } });
    expect(stepSendError(closed, t, scope)).toBe(translate('schoolLifecycle.schoolClosed'));
  });

  it('tells a closed step from a lost send', () => {
    expect(stepSendError(new ApiError({ message: 'x', status: 422, code: null }), t, scope)).toBe(
      translate(`${scope}.closedAlready`),
    );
    expect(stepSendError(new Error('Network request failed'), t, scope)).toBe(translate(`${scope}.sendFailed`));
  });

  it('takes the body\'s own key for a closed step, or none', () => {
    const e = new ApiError({ message: 'x', status: 422, code: null });
    expect(stepSendError(e, t, 'exerciseRunner.shortAnswer', 'handedInAlready')).toBe(
      translate('exerciseRunner.shortAnswer.handedInAlready'),
    );
    expect(stepSendError(e, t, 'exerciseRunner.shortAnswer', null)).toBe(translate('exerciseRunner.shortAnswer.sendFailed'));
  });
});
