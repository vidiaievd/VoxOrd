import { apiClient } from './client';
import { recordedGateway, USER_ID } from './__fixtures__/todayRecorded.router';
import { classStart, getNextClass, parseNextLesson } from './nextClass';
import { getStudentSchools, type StudentSchool } from './schools';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const A2 = '479830e3-dc65-4d6f-8557-e2ea73667628';
const B1_STEIN = '5a3a4222-3fe4-4ccb-9faf-8d98f308aaaf';
const now = new Date(2026, 9, 24, 12, 0);

async function recordedSchools(): Promise<StudentSchool[]> {
  mockGet.mockImplementation(recordedGateway());
  return (await getStudentSchools(USER_ID))!;
}

beforeEach(() => mockGet.mockReset());

describe('getNextClass (recorded from dev)', () => {
  it('takes the soonest class across all the groups, not only the first', async () => {
    const schools = await recordedSchools();

    const next = await getNextClass(schools, now);

    // The first group (NO-B1-2026) has no lessons; two others meet on Monday 26 October.
    expect(next).toEqual({
      lessonId: '5b1bd620-b829-4558-9270-57b597d59ab3',
      date: '2026-10-26',
      startTime: '00:00',
      endTime: '13:45',
      room: null,
      status: 'scheduled',
      schoolId: 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8',
      schoolName: 'Nordick',
      groupId: A2,
      groupName: 'NO-A2-2026',
      teacher: { userId: '679226f7-b302-4c4a-a866-ebd90fb53304', name: 'teacher3' },
    });
    expect(mockGet).toHaveBeenCalledWith(`/api/v1/scheduling/groups/${A2}/lessons/next`, {
      query: { limit: 1 },
    });
  });

  it('looks up a teacher outside the group roster, and drops one that cannot be found', async () => {
    const schools = await recordedSchools();
    const lesson = (teacherId: string) => [
      { id: 'l', date: '2026-10-25', startTime: '10:00:00', endTime: '11:00:00', teacherId, status: 'scheduled' },
    ];
    mockGet.mockImplementation(
      recordedGateway((path) => {
        if (path.includes(`/groups/${B1_STEIN}/lessons`)) return lesson('sub-9');
        if (path === '/api/v1/profiles/sub-9') return { displayName: 'Ola Vikar' };
        return undefined;
      }),
    );
    expect((await getNextClass(schools, now))?.teacher).toEqual({ userId: 'sub-9', name: 'Ola Vikar' });

    mockGet.mockImplementation(
      recordedGateway((path) => {
        if (path.includes(`/groups/${B1_STEIN}/lessons`)) return lesson('sub-9');
        if (path === '/api/v1/profiles/sub-9') return new Error('profile-service down');
        return undefined;
      }),
    );
    const next = await getNextClass(schools, now);
    expect(next).toMatchObject({ lessonId: 'l', startTime: '10:00', endTime: '11:00', teacher: null });
  });

  it('has no class further off than two weeks', async () => {
    const schools = await recordedSchools();
    expect(await getNextClass(schools, new Date(2026, 9, 12, 23, 0))).not.toBeNull();
    expect(await getNextClass(schools, new Date(2026, 9, 11, 23, 0))).toBeNull();
  });

  it('degrades to none when scheduling fails or answers in another shape', async () => {
    const schools = await recordedSchools();
    mockGet.mockImplementation(recordedGateway((path) => (path.includes('/scheduling/') ? new Error('down') : undefined)));
    expect(await getNextClass(schools, now)).toBeNull();
    mockGet.mockImplementation(recordedGateway((path) => (path.includes('/scheduling/') ? [{ id: 'x' }] : undefined)));
    expect(await getNextClass(schools, now)).toBeNull();
  });

  it('asks nothing for a learner with no group', async () => {
    expect(await getNextClass([], now)).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('parseNextLesson', () => {
  it('cuts a full ISO date and seconds to the day and HH:MM', () => {
    expect(
      parseNextLesson([
        { id: 'l', date: '2026-10-26T00:00:00.000Z', startTime: '09:00:00', endTime: '11:30:00', status: 'scheduled' },
      ]),
    ).toEqual({
      id: 'l',
      date: '2026-10-26',
      startTime: '09:00',
      endTime: '11:30',
      teacherId: null,
      room: null,
      status: 'scheduled',
    });
  });

  it('an empty list or a malformed time is no lesson', () => {
    expect(parseNextLesson([])).toBeNull();
    expect(parseNextLesson([{ id: 'l', date: '2026-10-26', startTime: '9am', endTime: '11:30', status: 's' }])).toBeNull();
    expect(parseNextLesson({ id: 'l' })).toBeNull();
  });
});

describe('classStart', () => {
  it('reads the school day and time as local time on the phone', () => {
    expect(classStart({ date: '2026-10-26', startTime: '09:05' })).toEqual(new Date(2026, 9, 26, 9, 5));
  });
});
