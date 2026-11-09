import type { PublicSchool } from '../api/schools';
import { applicationState, filterSchools, initials, websiteLabel } from './findSchool';

function school(name: string, overrides: Partial<PublicSchool> = {}): PublicSchool {
  return {
    schoolId: name,
    slug: name.toLowerCase(),
    name,
    description: null,
    avatarUrl: null,
    city: null,
    website: null,
    isOpenForApplications: true,
    ...overrides,
  };
}

describe('filterSchools', () => {
  const list = [
    school('Nordick'),
    school('Nordic school', { description: 'Norwegian language school', city: 'Brekstad' }),
    school('Alpha', { city: 'Oslo' }),
  ];

  it('lists everything in name order without a query', () => {
    expect(filterSchools(list, '  ').map(s => s.name)).toEqual(['Alpha', 'Nordic school', 'Nordick']);
  });

  it('searches name, description and city, ignoring case', () => {
    expect(filterSchools(list, 'NORDICK').map(s => s.name)).toEqual(['Nordick']);
    expect(filterSchools(list, 'language').map(s => s.name)).toEqual(['Nordic school']);
    expect(filterSchools(list, 'brekstad').map(s => s.name)).toEqual(['Nordic school']);
    expect(filterSchools(list, 'oslo').map(s => s.name)).toEqual(['Alpha']);
  });

  it('leaves the given list alone', () => {
    filterSchools(list, '');
    expect(list[0].name).toBe('Nordick');
  });
});

describe('applicationState', () => {
  const open = { isOpenForApplications: true };
  const closed = { isOpenForApplications: false };
  const app = (status: string) => ({ id: 'm', status });

  it('offers to apply when there is no application', () => {
    expect(applicationState(open, null)).toBe('apply');
    expect(applicationState(closed, null)).toBe('closed');
  });

  it('reads each status of an application', () => {
    expect(applicationState(open, app('pending'))).toBe('pending');
    expect(applicationState(open, app('onboarding'))).toBe('accepted');
    expect(applicationState(open, app('placement-review'))).toBe('accepted');
    expect(applicationState(open, app('active'))).toBe('member');
    expect(applicationState(open, app('rejected'))).toBe('reapply');
    expect(applicationState(open, app('left'))).toBe('reapply');
  });

  it('reads a learner placed in a group as studying there, whatever the application says', () => {
    expect(applicationState(open, app('onboarding'), true)).toBe('member');
    expect(applicationState(closed, null, true)).toBe('member');
  });

  it('keeps an application the school still holds even when it stopped taking new ones', () => {
    expect(applicationState(closed, app('pending'))).toBe('pending');
    expect(applicationState(closed, app('active'))).toBe('member');
    expect(applicationState(closed, app('rejected'))).toBe('closed');
  });
});

describe('labels', () => {
  it('shortens a website to its host', () => {
    expect(websiteLabel('https://nordic-school.com/')).toBe('nordic-school.com');
  });

  it('takes initials from the first two words, or two letters of one', () => {
    expect(initials('Nordic school')).toBe('NS');
    expect(initials('nordick')).toBe('NO');
  });
});
