/*
 * A feed page as notification-service answers it, after mockup `3d` (Notifications §5.2) —
 * for tests and for building the screen in `__DEV__` without a backend. Rows the phone must
 * drop ride along: a teacher's type, the teacher's nudge and an outcome nobody knows.
 */

const MIN = 60_000;
const at = (now: Date, minutesAgo: number) =>
  new Date(now.getTime() - minutesAgo * MIN).toISOString();

export function sampleNotificationsPage(now: Date = new Date()) {
  return {
    items: [
      {
        id: 'n-passed',
        type: 'ATTEMPT_REVIEWED',
        templateData: {
          attemptId: 'att-1',
          exerciseId: 'ex-1',
          templateCode: 'writing_task',
          outcome: 'approved',
          score: 1,
          comment: 'Fin beskrivelse!',
          hasComment: true,
          approvedItems: null,
          totalItems: null,
          containerId: 'course-1',
          exercisePath: {
            course: 'Ny i Norge A2',
            module: 'Leksjon 17',
            exercise: 'Beskriv bildet',
          },
          occurredAt: at(now, 10),
        },
        isRead: false,
        archivedAt: null,
        createdAt: at(now, 10),
      },
      {
        id: 'n-returned',
        type: 'ATTEMPT_REVIEWED',
        templateData: {
          attemptId: 'att-2',
          exerciseId: 'ex-2',
          templateCode: 'writing_task',
          outcome: 'returned',
          score: 0.4,
          comment: null,
          hasComment: true,
          approvedItems: 2,
          totalItems: 5,
          containerId: 'course-1',
          exercisePath: {
            course: 'Ny i Norge A2',
            module: 'Leksjon 18',
            exercise: 'En e-post til sjefen',
          },
          occurredAt: at(now, 120),
        },
        isRead: false,
        archivedAt: null,
        createdAt: at(now, 120),
      },
      {
        id: 'n-nudge',
        type: 'STUDY_REMINDER',
        templateData: { schoolId: 'school-1', requestedBy: 'teacher-1' },
        isRead: false,
        archivedAt: null,
        createdAt: at(now, 600),
      },
      {
        id: 'n-class',
        type: 'LESSON_REMINDER',
        templateData: {
          lessonId: 'lesson-1',
          date: '2026-10-26',
          startTime: '17:30',
          endTime: '19:00',
          isExam: false,
        },
        isRead: true,
        archivedAt: null,
        createdAt: at(now, 1500),
      },
      {
        id: 'n-group',
        type: 'GROUP_ASSIGNED',
        templateData: {
          membershipId: 'm-1',
          schoolId: 'school-1',
          schoolName: 'Nordick',
          groupId: 'group-1',
          groupName: 'ЛИН-21',
          occurredAt: at(now, 3000),
        },
        isRead: true,
        archivedAt: null,
        createdAt: at(now, 3000),
      },
      {
        id: 'n-approved',
        type: 'ENROLLMENT_APPROVED',
        templateData: {
          membershipId: 'm-1',
          schoolId: 'school-1',
          schoolName: 'Nordick',
          occurredAt: at(now, 4000),
        },
        isRead: true,
        archivedAt: null,
        createdAt: at(now, 4000),
      },
      {
        id: 'n-rejected',
        type: 'ENROLLMENT_REJECTED',
        templateData: {
          membershipId: 'm-2',
          schoolId: 'school-2',
          schoolName: 'Oslo Språk',
          occurredAt: at(now, 5000),
        },
        isRead: true,
        archivedAt: null,
        createdAt: at(now, 5000),
      },
      {
        id: 'n-teacher',
        type: 'REVIEW_DIGEST',
        templateData: { pending: 4 },
        isRead: false,
        archivedAt: null,
        createdAt: at(now, 6000),
      },
      {
        id: 'n-odd-outcome',
        type: 'ATTEMPT_REVIEWED',
        templateData: {
          attemptId: 'att-3',
          exerciseId: 'ex-3',
          outcome: 'partially',
          exercisePath: null,
        },
        isRead: false,
        archivedAt: null,
        createdAt: at(now, 7000),
      },
    ],
    unreadCount: 5,
    nextCursor: 'n-odd-outcome',
  };
}
