import type {
  NotificationItem,
  SubmissionParams,
} from '../../api/notifications';
import type { IconName } from '../../components/ui/Icon';

type T = (path: string, vars?: Record<string, string | number>) => string;

export interface RowText {
  icon: IconName;
  title: string;
  /** null when the item has nothing more to say. */
  body: string | null;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** «Принято 3 из 5.», else «Результат: 80%.», else nothing — a pass's one line of facts. */
function passedLine(p: SubmissionParams, t: T): string | null {
  // A submission with nothing readable reports 0 of 0 — not worth saying.
  if (p.approvedItems !== null && p.totalItems !== null && p.totalItems > 0)
    return t('notifications.row.passedItems', {
      approved: p.approvedItems,
      total: p.totalItems,
    });
  if (p.score !== null)
    return t('notifications.row.score', { percent: Math.round(p.score) });
  return null;
}

/**
 * The words of one row (Notifications §5.2), built from the item's facts in the reader's
 * language — the server sends a type and its data, never text.
 */
export function describeNotification(item: NotificationItem, t: T): RowText {
  switch (item.type) {
    case 'submission_passed':
    case 'submission_returned': {
      const p = item.params;
      const passed = item.type === 'submission_passed';
      const title =
        p.title ?? p.courseTitle ?? t('notifications.row.workFallback');
      const lines: string[] = [];
      if (passed) {
        const facts = passedLine(p, t);
        if (facts) lines.push(facts);
      } else {
        lines.push(t('notifications.row.returnedHint'));
      }
      if (p.hasComment) lines.push(t('notifications.row.hasComment'));
      return {
        icon: passed ? 'CheckCircle' : 'ArrowCounterClockwise',
        title: t(
          passed ? 'notifications.row.passed' : 'notifications.row.returned',
          {
            title,
          },
        ),
        body: lines.length ? lines.join(' ') : null,
      };
    }
    case 'ai_reviewed': {
      // The spec's body is the model's summary; that text never leaves the engine, so the
      // row says which way it went and the mark, and the work itself holds the review.
      const p = item.params;
      const facts = p.passed
        ? passedLine(p, t) ?? t('notifications.row.aiPassed')
        : t('notifications.row.returnedHint');
      return {
        icon: 'Sparkle',
        title: t('notifications.row.aiReviewed', {
          title: p.title ?? p.courseTitle ?? t('notifications.row.workFallback'),
        }),
        body: facts,
      };
    }
    case 'class_scheduled': {
      const p = item.params;
      const [y, m, d] = p.date.split('-').map(Number);
      const day = WEEKDAYS[new Date(y, m - 1, d).getDay()];
      return {
        icon: 'CalendarBlank',
        title: t(
          p.isExam ? 'notifications.row.exam' : 'notifications.row.class',
          {
            weekday: t(`notifications.weekday.${day}`),
            time: p.startTime.slice(0, 5),
          },
        ),
        body: p.endTime
          ? t('notifications.row.classRange', {
              start: p.startTime.slice(0, 5),
              end: p.endTime.slice(0, 5),
            })
          : null,
      };
    }
    case 'enrollment_approved':
      return {
        icon: 'GraduationCap',
        title: t('notifications.row.enrollmentApproved'),
        body: item.params.schoolName,
      };
    case 'enrollment_rejected':
      return {
        icon: 'GraduationCap',
        title: t('notifications.row.enrollmentRejected'),
        body: item.params.schoolName,
      };
    case 'group_joined':
      return {
        icon: 'GraduationCap',
        title: item.params.groupName
          ? t('notifications.row.groupJoinedNamed', {
              group: item.params.groupName,
            })
          : t('notifications.row.groupJoined'),
        body: item.params.schoolName,
      };
  }
}
