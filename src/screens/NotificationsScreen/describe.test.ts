import type {
  NotificationItem,
  SubmissionParams,
} from '../../api/notifications';
import { translateIn } from '../../i18n';
import { describeNotification } from './describe';

const base = { id: 'n1', createdAt: '2026-10-29T10:00:00Z', read: false };
const tIn =
  (lang: string) => (p: string, v?: Record<string, string | number>) =>
    translateIn(lang, p, v);

const sub = (over: Partial<SubmissionParams> = {}) =>
  ({
    ...base,
    type: 'submission_passed',
    target: { kind: 'submission', submissionId: 'a', exerciseId: 'e' },
    params: {
      title: 'Beskriv bildet',
      courseTitle: null,
      score: null,
      hasComment: false,
      approvedItems: null,
      totalItems: null,
      ...over,
    },
  } as NotificationItem);

describe('describeNotification', () => {
  it('words a passed piece of work with the count of accepted items', () => {
    const r = describeNotification(
      sub({ approvedItems: 3, totalItems: 4, hasComment: true }),
      tIn('en'),
    );
    expect(r.icon).toBe('CheckCircle');
    expect(r.title).toBe('Passed: Beskriv bildet');
    expect(r.body).toBe('3 of 4 accepted. Your teacher left feedback.');
  });

  it('falls back to the score, then to the course title, then to a plain word', () => {
    expect(describeNotification(sub({ score: 76 }), tIn('ru')).body).toBe(
      'Результат: 76%.',
    );
    expect(
      describeNotification(sub({ title: null, courseTitle: 'A2' }), tIn('en'))
        .title,
    ).toBe('Passed: A2');
    const bare = describeNotification(sub({ title: null }), tIn('uk'));
    expect(bare.title).toBe('Зараховано: робота');
    expect(bare.body).toBeNull();
  });

  it('says nothing of 0 of 0 accepted — falls to the score', () => {
    expect(
      describeNotification(
        sub({ approvedItems: 0, totalItems: 0, score: 80 }),
        tIn('en'),
      ).body,
    ).toBe('Score: 80%.');
  });

  it('words a model\'s verdict with its mark, or a plain pass, or the resubmission hint', () => {
    const ai = (over: Partial<SubmissionParams> & { passed: boolean }) =>
      ({
        ...sub(over),
        type: 'ai_reviewed',
        params: { ...sub(over).params, passed: over.passed },
      } as NotificationItem);
    const scored = describeNotification(ai({ passed: true, score: 85 }), tIn('ru'));
    expect(scored.icon).toBe('Sparkle');
    expect(scored.title).toBe('Проверено ИИ: Beskriv bildet');
    expect(scored.body).toBe('Результат: 85%.');
    expect(describeNotification(ai({ passed: true }), tIn('en')).body).toBe('Passed.');
    expect(
      describeNotification(ai({ passed: false, title: null }), tIn('uk')),
    ).toMatchObject({
      title: 'Перевірено ШІ: робота',
      body: 'Потрібно виправити й здати знову.',
    });
  });

  it('asks for a resubmission on returned work', () => {
    const item = { ...sub(), type: 'submission_returned' } as NotificationItem;
    const r = describeNotification(item, tIn('ru'));
    expect(r.icon).toBe('ArrowCounterClockwise');
    expect(r.title).toBe('На перезапись: Beskriv bildet');
    expect(r.body).toBe('Нужно исправить и сдать снова.');
  });

  it('names the weekday of a class from its calendar day', () => {
    const item = {
      ...base,
      type: 'class_scheduled',
      target: { kind: 'none' },
      params: {
        date: '2026-11-02',
        startTime: '17:30:00',
        endTime: '19:00',
        isExam: false,
      },
    } as NotificationItem;
    const r = describeNotification(item, tIn('ru'));
    expect(r.title).toBe('Занятие в понедельник, 17:30');
    expect(r.body).toBe('17:30–19:00');
    expect(
      describeNotification(
        {
          ...item,
          params: { ...item.params, isExam: true, endTime: null },
        } as NotificationItem,
        tIn('en'),
      ),
    ).toEqual({
      icon: 'CalendarBlank',
      title: 'Exam on Monday, 17:30',
      body: null,
    });
  });

  it('words the school news', () => {
    const joined = {
      ...base,
      type: 'group_joined',
      target: { kind: 'none' },
      params: { schoolName: 'Nordick', groupName: 'A2-1' },
    } as NotificationItem;
    expect(describeNotification(joined, tIn('en'))).toMatchObject({
      title: 'You were added to group A2-1',
      body: 'Nordick',
    });
    const approved = {
      ...joined,
      type: 'enrollment_approved',
    } as NotificationItem;
    expect(describeNotification(approved, tIn('uk')).title).toBe(
      'Запис на курс схвалено',
    );
  });
});
