import { backTarget, tabOf } from './screens';
import { notificationScreen, openNotification } from './openNotification';

const submission = {
  target: { kind: 'submission' as const, submissionId: 'a1', exerciseId: 'e1' },
};
const none = { target: { kind: 'none' as const } };

describe('openNotification', () => {
  it('leads a submission to the Submission screen', () => {
    expect(notificationScreen(submission)).toEqual({
      name: 'Submission',
      submissionId: 'a1',
      exerciseId: 'e1',
    });
  });

  it('keeps Back on the Notifications tab', () => {
    const screen = notificationScreen(submission)!;
    expect(tabOf(screen)).toBe('Notifications');
    expect(backTarget(screen)).toEqual({ name: 'Notifications' });
  });

  it('navigates once for a target and not at all for none', () => {
    const navigate = jest.fn();
    expect(openNotification(submission, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);

    navigate.mockClear();
    expect(openNotification(none, navigate)).toBe(false);
    expect(notificationScreen(none)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
