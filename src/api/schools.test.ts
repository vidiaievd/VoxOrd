import { ApiError, apiClient } from './client';
import { recordedGateway, SCHOOL_ID, USER_ID } from './__fixtures__/todayRecorded.router';
import {
  applyToSchool,
  getPublicSchools,
  getSchoolPage,
  getStudentSchools,
  isPlaced,
  parsePlacements,
} from './schools';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const offline = new ApiError({ message: 'offline', status: null, code: 'NETWORK_ERROR' });

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('getStudentSchools (recorded from dev)', () => {
  it('reads the school with every group the learner is placed in, and what each opens', async () => {
    mockGet.mockImplementation(recordedGateway());

    const schools = await getStudentSchools(USER_ID);

    expect(schools).toHaveLength(1);
    const [nordick] = schools!;
    expect(nordick).toMatchObject({
      membershipId: '86729e53-72c9-40eb-8bdc-15b31b902da9',
      schoolId: SCHOOL_ID,
      schoolName: 'Nordick',
      status: 'onboarding',
      groupId: '52d1e710-9f94-4b75-90eb-1390b35481ac',
      groupName: 'NO-B1-2026',
    });
    expect(nordick.groups.map((g) => g.groupName)).toEqual(['NO-B1-2026', 'NO-A2-2026', 'Norwigian -2028']);
    expect(nordick.groups[1]).toEqual({
      groupId: '479830e3-dc65-4d6f-8557-e2ea73667628',
      groupName: 'NO-A2-2026',
      teachers: [
        { userId: '679226f7-b302-4c4a-a866-ebd90fb53304', name: 'teacher3' },
        { userId: '4cb6f207-aeb4-4be5-bd4d-fded82ef94a1', name: 'Barmaley' },
      ],
      mainCourse: { courseId: '82c35711-f042-5c27-9fe1-174bedee7911', courseName: 'Ny i Norge — A2' },
      materials: [{ courseId: 'a5fef679-04ad-5307-85ab-14d7e527cc37', courseName: 'Norsk B1 — Stein på stein' }],
    });
    // Placed while still onboarding: a school for Today (owner's decision 2026-10-24).
    expect(isPlaced(nordick)).toBe(true);
  });

  it('keeps only the schools where the caller is a student', async () => {
    mockGet.mockImplementation(
      recordedGateway((path) =>
        path === '/api/v1/schools' ? [{ id: 'x', name: 'Mine', myRole: 'OWNER' }] : undefined,
      ),
    );
    expect(await getStudentSchools(USER_ID)).toEqual([]);
  });

  it('drops a school whose membership cannot be read', async () => {
    mockGet.mockImplementation(
      recordedGateway((path) => (path.endsWith('/memberships/me') ? new ApiError({ message: 'x', status: 500 }) : undefined)),
    );
    expect(await getStudentSchools(USER_ID)).toEqual([]);
  });

  it('keeps the school without groups when the placements cannot be read', async () => {
    mockGet.mockImplementation(
      recordedGateway((path) => (path.endsWith(`/students/${USER_ID}/memberships`) ? { not: 'a list' } : undefined)),
    );
    const [row] = (await getStudentSchools(USER_ID))!;
    expect(row).toMatchObject({ groupId: null, groupName: null, groups: [] });
    expect(isPlaced(row)).toBe(false);
  });

  it('keeps a group without courses when the group cannot be read, and a course without its name', async () => {
    mockGet.mockImplementation(
      recordedGateway((path) => {
        if (path.endsWith('/groups/52d1e710-9f94-4b75-90eb-1390b35481ac')) return new Error('down');
        if (path === '/api/v1/containers/82c35711-f042-5c27-9fe1-174bedee7911') return new Error('gone');
        return undefined;
      }),
    );
    const [row] = (await getStudentSchools(USER_ID))!;
    expect(row.groups[0]).toMatchObject({ mainCourse: null, materials: [] });
    expect(row.groups[1].mainCourse).toEqual({ courseId: '82c35711-f042-5c27-9fe1-174bedee7911', courseName: null });
  });

  it('reads a list that is not a list as nothing known', async () => {
    mockGet.mockImplementation(recordedGateway((path) => (path === '/api/v1/schools' ? { items: 'x' } : undefined)));
    expect(await getStudentSchools(USER_ID)).toBeNull();
  });

  it('reads a refusal as nothing known, and throws offline so the cache stays', async () => {
    mockGet.mockRejectedValueOnce(new ApiError({ message: 'no', status: 403 }));
    expect(await getStudentSchools(USER_ID)).toBeNull();
    mockGet.mockRejectedValueOnce(offline);
    await expect(getStudentSchools(USER_ID)).rejects.toBe(offline);
  });
});

describe('parsePlacements', () => {
  it('skips past placements, groups that ended and rows that are not placements', () => {
    expect(
      parsePlacements([
        { groupId: 'a', groupName: 'A', status: 'past', teachers: [] },
        { groupId: 'b', groupName: 'B', status: 'active', groupStatus: 'archived' },
        { groupName: 'no id', status: 'active' },
        'junk',
        { groupId: 'c', status: 'active', teachers: [{ userId: 't' }, { userId: 'u', name: 'U' }] },
      ]),
    ).toEqual([{ groupId: 'c', groupName: null, teachers: [{ userId: 'u', name: 'U' }] }]);
  });
});

describe('isPlaced', () => {
  it('needs a group and an application that has not ended', () => {
    expect(isPlaced({ status: 'placement-review', groupId: 'g' })).toBe(true);
    expect(isPlaced({ status: 'active', groupId: null })).toBe(false);
    expect(isPlaced({ status: 'left', groupId: 'g' })).toBe(false);
    expect(isPlaced({ status: 'rejected', groupId: 'g' })).toBe(false);
  });
});

/** `GET /api/v1/schools/public?limit=100` on dev, 2026-10-28 (two of its three schools). */
const PUBLIC_PAGE = {
  items: [
    {
      schoolId: 'fc111d07-e0e5-42b1-9b8b-a1e011580c1d',
      schoolSlug: 'nordic-school',
      schoolName: 'Nordic school',
      description: 'Norwegian language school',
      city: 'Brekstad',
      website: 'https://nordic-school.com',
      isOpenForApplications: true,
    },
    { schoolId: SCHOOL_ID, schoolSlug: 'nordick', schoolName: 'Nordick', isOpenForApplications: true },
  ],
  pageInfo: { endCursor: 'eyJuYW1lIjoi', hasNextPage: false, total: 2 },
};

describe('getPublicSchools (recorded from dev)', () => {
  it('reads every school, absent fields as null', async () => {
    mockGet.mockResolvedValueOnce(PUBLIC_PAGE);
    const schools = await getPublicSchools();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/schools/public', { query: { limit: 100, cursor: undefined } });
    expect(schools).toEqual([
      {
        schoolId: 'fc111d07-e0e5-42b1-9b8b-a1e011580c1d',
        slug: 'nordic-school',
        name: 'Nordic school',
        description: 'Norwegian language school',
        avatarUrl: null,
        city: 'Brekstad',
        website: 'https://nordic-school.com',
        isOpenForApplications: true,
      },
      expect.objectContaining({ slug: 'nordick', description: null, city: null }),
    ]);
  });

  it('follows the cursor until the last page and drops rows that are not schools', async () => {
    mockGet
      .mockResolvedValueOnce({ items: [PUBLIC_PAGE.items[0], { schoolName: 'no id' }], pageInfo: { endCursor: 'c1', hasNextPage: true } })
      .mockResolvedValueOnce({ items: [PUBLIC_PAGE.items[1]], pageInfo: { endCursor: 'c2', hasNextPage: false } });
    const schools = await getPublicSchools();
    expect(mockGet).toHaveBeenLastCalledWith('/api/v1/schools/public', { query: { limit: 100, cursor: 'c1' } });
    expect(schools.map((s) => s.slug)).toEqual(['nordic-school', 'nordick']);
  });
});

describe('getSchoolPage', () => {
  it('reads the school and the learner\'s application to it', async () => {
    mockGet.mockImplementation(async (path: string) =>
      path === '/api/v1/schools/public/nordick'
        ? PUBLIC_PAGE.items[1]
        : path === `/api/v1/schools/${SCHOOL_ID}/memberships/me`
          ? { id: 'm1', status: 'pending', schoolId: SCHOOL_ID }
          : undefined,
    );
    const page = await getSchoolPage('nordick');
    expect(page.school.name).toBe('Nordick');
    expect(page.application).toEqual({ id: 'm1', status: 'pending' });
  });

  it('reads a 404 for the application as none, and any other failure as a failure', async () => {
    const notFound = new ApiError({ message: 'none', status: 404 });
    mockGet.mockImplementation(async (path: string) => {
      if (path.endsWith('/memberships/me')) throw notFound;
      return PUBLIC_PAGE.items[1];
    });
    expect((await getSchoolPage('nordick')).application).toBeNull();

    mockGet.mockImplementation(async (path: string) => {
      if (path.endsWith('/memberships/me')) throw offline;
      return PUBLIC_PAGE.items[1];
    });
    await expect(getSchoolPage('nordick')).rejects.toBe(offline);
  });
});

describe('applyToSchool', () => {
  it('applies as the web\'s public page does', async () => {
    mockPost.mockResolvedValueOnce({ id: 'm2', status: 'onboarding', schoolId: SCHOOL_ID });
    const app = await applyToSchool(SCHOOL_ID, { language: 'nb', selfReportedLevel: 'A2' });
    expect(mockPost).toHaveBeenCalledWith(`/api/v1/schools/${SCHOOL_ID}/memberships`, {
      source: 'public-apply',
      language: 'nb',
      selfReportedLevel: 'A2',
    });
    expect(app).toEqual({ id: 'm2', status: 'onboarding' });
  });
});
