import { ApiError, apiClient } from './client';
import { getNextAssignment, parseAssignments, upcoming } from './assignments';

jest.mock('./client', () => ({
  apiClient: { get: jest.fn() },
  ApiError: jest.requireActual('./client').ApiError,
}));

const mockGet = apiClient.get as jest.Mock;

/** Recorded 2026-10-24 on dev for student@email.com — the only assignment, an overdue exercise. */
const recorded = [
  {
    id: 'ccbde9d5-4b14-4063-8102-1c4f803e88a7',
    assignerId: '0b2f2404-854a-4ea5-9d33-816db353983f',
    assigneeId: '182558cf-f90b-464f-84a4-5a68610b7f94',
    schoolId: 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8',
    groupId: '479830e3-dc65-4d6f-8557-e2ea73667628',
    contentRef: { type: 'EXERCISE', id: 'cf38e1e1-9f4e-541c-bfc8-e2e6417d174f' },
    status: 'OVERDUE',
    assignedAt: '2026-09-12T12:25:18.910Z',
    dueAt: '2026-09-20T18:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    cancelledReason: null,
    notes: 'Ukas oppgave',
  },
];

const active = (id: string, dueAt: string, type = 'LESSON') => ({
  ...recorded[0],
  id,
  status: 'ACTIVE',
  dueAt,
  contentRef: { type, id: `content-${id}` },
});

beforeEach(() => mockGet.mockReset());

describe('getNextAssignment', () => {
  it('has nothing to put on Today when the only assignment is overdue (dev)', async () => {
    mockGet.mockResolvedValueOnce(recorded);

    expect(await getNextAssignment()).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/api/v1/assignments/mine');
  });

  it('takes the soonest active one it can name, skipping one without a title', async () => {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/api/v1/assignments/mine') {
        return [active('late', '2026-11-10T10:00:00Z'), active('soon', '2026-11-01T10:00:00Z', 'EXERCISE'), active('mid', '2026-11-05T10:00:00Z')];
      }
      if (path === '/api/v1/exercises/content-soon') return { title: null };
      if (path === '/api/v1/lessons/content-mid') return { title: 'Familien' };
      return { title: 'Later' };
    });

    expect(await getNextAssignment()).toMatchObject({ assignmentId: 'mid', title: 'Familien', contentType: 'LESSON', notes: 'Ukas oppgave' });
  });

  it('throws when learning-service is out of reach, and reads a refusal as none', async () => {
    const down = new ApiError({ message: 'down', status: 502 });
    mockGet.mockRejectedValueOnce(down);
    await expect(getNextAssignment()).rejects.toBe(down);

    mockGet.mockRejectedValueOnce(new ApiError({ message: 'no', status: 403 }));
    expect(await getNextAssignment()).toBeNull();
  });
});

describe('parseAssignments', () => {
  it('drops a row of an unknown kind or without a due date, not the list', () => {
    const rows = parseAssignments([recorded[0], { ...recorded[0], contentRef: { type: 'VIDEO', id: 'x' } }, { ...recorded[0], dueAt: 'soon' }]);
    expect(rows).toHaveLength(1);
    expect(parseAssignments({ items: [] })).toBeNull();
  });

  it('keeps only active ones, soonest first', () => {
    const rows = parseAssignments([active('b', '2026-11-02T00:00:00Z'), recorded[0], active('a', '2026-11-01T00:00:00Z')])!;
    expect(upcoming(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
