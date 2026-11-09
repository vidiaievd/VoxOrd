import type { StudentSchool } from '../../api/schools';
import { translateIn } from '../../i18n';
import {
  avatarLetter,
  identityLines,
  schoolRows,
  subscriptionCard,
} from './profileLogic';

jest.mock('../../store/settingsStore', () => ({
  settingsStore: { getAll: () => ({ uiLanguage: 'en' }) },
}));
jest.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ uiLanguage: 'en' }),
}));

const t = (path: string, vars?: Record<string, string | number>) =>
  translateIn('en', path, vars);

describe('avatarLetter / identityLines', () => {
  it('takes the name, else the e-mail', () => {
    expect(avatarLetter('ola', 'x@y.no')).toBe('O');
    expect(avatarLetter(null, 'x@y.no')).toBe('X');
    expect(avatarLetter(null, null)).toBe('');
  });

  it('leads with the e-mail when there is no name', () => {
    expect(identityLines('Ola', 'o@x.no', t)).toEqual({
      title: 'Ola',
      meta: 'o@x.no · email sign-in',
    });
    expect(identityLines(null, 'o@x.no', t)).toEqual({
      title: 'o@x.no',
      meta: 'email sign-in',
    });
  });
});

describe('subscriptionCard', () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  it('is plain on the free plan', () => {
    const c = subscriptionCard(
      { source: 'free_plan', planName: 'Free', status: null, endsAt: null },
      t,
      fmt,
    );
    expect(c).toEqual({
      lit: false,
      title: 'Free plan',
      meta: null,
      tag: null,
    });
  });
  it('names the plan, its end and a trial', () => {
    const c = subscriptionCard(
      {
        source: 'subscription',
        planName: 'Pro',
        status: 'trial',
        endsAt: '2026-12-01T00:00:00Z',
      },
      t,
      fmt,
    );
    expect(c).toEqual({
      lit: true,
      title: 'Pro',
      meta: 'Until 2026-12-01',
      tag: 'Trial',
    });
  });
});

describe('schoolRows', () => {
  const school = (over: Partial<StudentSchool>): StudentSchool => ({
    membershipId: 'm',
    schoolId: 's1',
    schoolName: 'Nordick',
    status: 'active',
    groupId: 'g1',
    groupName: 'A2',
    groups: [
      {
        groupId: 'g1',
        groupName: 'A2',
        teachers: [{ userId: 't', name: 'Kari' }],
        mainCourse: null,
        materials: [],
      },
    ],
    ...over,
  });
  it('lists placed schools with group and teacher', () => {
    expect(schoolRows([school({})], t)).toEqual([
      { schoolId: 's1', name: 'Nordick', meta: 'Group A2 · Kari' },
    ]);
  });
  it('drops unplaced and ended ones; falls back without a teacher', () => {
    expect(
      schoolRows([school({ groupId: null }), school({ status: 'left' })], t),
    ).toEqual([]);
    expect(schoolRows([school({ groups: [] })], t)[0].meta).toBe('Group A2');
    expect(schoolRows(null, t)).toEqual([]);
  });
});
