import { apiClient } from './client';
import { sampleNotificationsPage } from './__fixtures__/notificationsSample';
import {
  adaptNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  matchesFilter,
  parseNotificationsPage,
} from './notifications';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const now = new Date('2026-10-29T12:00:00.000Z');
const rows = sampleNotificationsPage(now).items;
const row = (id: string) => rows.find(r => r.id === id)!;

let log: jest.SpyInstance;
beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => log.mockRestore());

describe('adaptNotification', () => {
  it('maps an approved review to submission_passed with the work as its target', () => {
    expect(adaptNotification(row('n-passed'))).toEqual({
      id: 'n-passed',
      createdAt: row('n-passed').createdAt,
      read: false,
      type: 'submission_passed',
      params: {
        title: 'Beskriv bildet',
        courseTitle: 'Ny i Norge A2',
        score: 1,
        hasComment: true,
        approvedItems: null,
        totalItems: null,
      },
      target: { kind: 'submission', submissionId: 'att-1', exerciseId: 'ex-1' },
    });
  });

  it('maps a returned review to submission_returned, keeping the item counts', () => {
    const item = adaptNotification(row('n-returned'))!;
    expect(item.type).toBe('submission_returned');
    expect(item.params).toMatchObject({
      title: 'En e-post til sjefen',
      approvedItems: 2,
      totalItems: 5,
      score: 0.4,
    });
  });

  it('falls back to the module, then the course, for the title; none on older work', () => {
    const base = row('n-passed');
    const withPath = (exercisePath: unknown) =>
      adaptNotification({
        ...base,
        templateData: { ...base.templateData, exercisePath },
      })!.params;
    expect(
      withPath({ course: 'C', module: 'M', exercise: null }),
    ).toMatchObject({ title: 'M' });
    expect(
      withPath({ course: 'C', module: null, exercise: null }),
    ).toMatchObject({ title: 'C' });
    expect(withPath(null)).toMatchObject({ title: null, courseTitle: null });
  });

  it('reads a comment on an older row without hasComment', () => {
    const base = row('n-passed');
    const older: Record<string, unknown> = { ...base.templateData };
    delete older.hasComment;
    expect(
      adaptNotification({ ...base, templateData: older })!.params,
    ).toMatchObject({ hasComment: true });
    expect(
      adaptNotification({ ...base, templateData: { ...older, comment: null } })!
        .params,
    ).toMatchObject({
      hasComment: false,
    });
  });

  it('maps a lesson reminder to class_scheduled with no target', () => {
    expect(adaptNotification(row('n-class'))).toMatchObject({
      type: 'class_scheduled',
      read: true,
      params: {
        date: '2026-10-26',
        startTime: '17:30',
        endTime: '19:00',
        isExam: false,
      },
      target: { kind: 'none' },
    });
  });

  it('trims seconds off lesson times and drops a reminder without a time', () => {
    const base = row('n-class');
    const item = adaptNotification({
      ...base,
      templateData: {
        ...base.templateData,
        startTime: '17:30:00',
        endTime: undefined,
      },
    })!;
    expect(item.params).toMatchObject({ startTime: '17:30', endTime: null });
    expect(
      adaptNotification({ ...base, templateData: { date: '2026-10-26' } }),
    ).toBeNull();
  });

  it('maps the learner’s school news, with no target', () => {
    expect(adaptNotification(row('n-group'))).toMatchObject({
      type: 'group_joined',
      params: { schoolName: 'Nordick', groupName: 'ЛИН-21' },
      target: { kind: 'none' },
    });
    expect(adaptNotification(row('n-approved'))).toMatchObject({
      type: 'enrollment_approved',
      params: { schoolName: 'Nordick', groupName: null },
    });
    expect(adaptNotification(row('n-rejected'))).toMatchObject({
      type: 'enrollment_rejected',
      params: { schoolName: 'Oslo Språk', groupName: null },
    });
  });

  it('drops school news without names', () => {
    const group = row('n-group');
    expect(
      adaptNotification({
        ...group,
        templateData: { ...group.templateData, groupName: null },
      }),
    ).toBeNull();
    const approved = row('n-approved');
    expect(adaptNotification({ ...approved, templateData: {} })).toBeNull();
  });

  it('hides the teacher’s nudge, teacher-only types and unknown types', () => {
    expect(adaptNotification(row('n-nudge'))).toBeNull();
    expect(adaptNotification(row('n-teacher'))).toBeNull();
    expect(
      adaptNotification({ ...row('n-class'), type: 'SOMETHING_NEW' }),
    ).toBeNull();
  });

  it('drops an outcome nobody knows instead of crashing', () => {
    expect(adaptNotification(row('n-odd-outcome'))).toBeNull();
  });

  it('drops a review without its ids, and a malformed row', () => {
    const base = row('n-passed');
    expect(
      adaptNotification({
        ...base,
        templateData: { ...base.templateData, attemptId: undefined },
      }),
    ).toBeNull();
    expect(adaptNotification({ ...base, createdAt: 'yesterday' })).toBeNull();
    expect(adaptNotification({ ...base, templateData: undefined })).toBeNull();
    expect(adaptNotification(null)).toBeNull();
  });
});

describe('parseNotificationsPage', () => {
  it('keeps the rows the learner is shown, the server’s unread count and the cursor', () => {
    const page = parseNotificationsPage(sampleNotificationsPage(now))!;
    expect(page.items.map(n => n.id)).toEqual([
      'n-passed',
      'n-returned',
      'n-class',
      'n-group',
      'n-approved',
      'n-rejected',
    ]);
    expect(page.unreadCount).toBe(5);
    expect(page.nextCursor).toBe('n-odd-outcome');
  });

  it('answers null for something that is not a page', () => {
    expect(parseNotificationsPage({ items: [] })).toBeNull();
    expect(parseNotificationsPage({ unreadCount: 0 })).toBeNull();
    expect(parseNotificationsPage(undefined)).toBeNull();
  });
});

describe('matchesFilter', () => {
  const ids = (filter: 'all' | 'work' | 'course') =>
    parseNotificationsPage(sampleNotificationsPage(now))!
      .items.filter(n => matchesFilter(n, filter))
      .map(n => n.id);

  it('splits the feed into work and courses & school', () => {
    expect(ids('all')).toHaveLength(6);
    expect(ids('work')).toEqual(['n-passed', 'n-returned']);
    expect(ids('course')).toEqual([
      'n-class',
      'n-group',
      'n-approved',
      'n-rejected',
    ]);
  });
});

describe('requests', () => {
  it('asks for a page with the cursor, and throws on a malformed answer', async () => {
    mockGet.mockResolvedValueOnce(sampleNotificationsPage(now));
    await getNotifications('n-x');
    expect(mockGet).toHaveBeenCalledWith('/api/v1/notifications', {
      query: { limit: 50, cursor: 'n-x' },
    });

    mockGet.mockResolvedValueOnce({ items: [] });
    await expect(getNotifications()).rejects.toThrow('malformed');
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/notifications', {
      query: { limit: 50, cursor: undefined },
    });
  });

  it('marks one and all read', async () => {
    mockPost.mockResolvedValue(undefined);
    await markNotificationRead('n-1');
    await markAllNotificationsRead();
    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      '/api/v1/notifications/n-1/read',
    );
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/api/v1/notifications/read-all',
    );
  });
});
