import { ApiError } from '../api/client';
import {
  announceSchoolRefusal,
  daysLeft,
  isObsoleteHistoryOnly,
  lifecycleErrorKey,
  onSchoolNotActive,
  schoolNotActiveStatus,
  toMaintenanceSource,
} from './schoolLifecycle';

const refusal = (body: unknown, code: string | null = null) =>
  new ApiError({ message: 'x', status: 409, code, body });

describe('schoolNotActiveStatus', () => {
  it('reads the three body shapes the services answer in', () => {
    expect(schoolNotActiveStatus(refusal({ error: { code: 'SCHOOL_NOT_ACTIVE', status: 'closed' } }))).toBe('closed');
    expect(schoolNotActiveStatus(refusal({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' }))).toBe('suspended');
    expect(schoolNotActiveStatus(refusal({ message: 'SCHOOL_NOT_ACTIVE' }))).toBe('suspended');
  });

  it('falls back to the error code, and to the milder wording when the status is missing', () => {
    expect(schoolNotActiveStatus(refusal(null, 'SCHOOL_NOT_ACTIVE'))).toBe('suspended');
    expect(schoolNotActiveStatus(refusal({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'purged' }))).toBe('closed');
  });

  it('is null for any other refusal and for anything that is not an ApiError', () => {
    expect(schoolNotActiveStatus(refusal({ code: 'ATTEMPT_IN_PROGRESS', attemptId: 'a' }))).toBeNull();
    expect(schoolNotActiveStatus(new Error('SCHOOL_NOT_ACTIVE'))).toBeNull();
    expect(schoolNotActiveStatus(undefined)).toBeNull();
  });
});

describe('lifecycleErrorKey', () => {
  it('names the phrase for the status', () => {
    expect(lifecycleErrorKey(refusal({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'closed' }))).toBe('schoolClosed');
    expect(lifecycleErrorKey(refusal({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'suspended' }))).toBe('schoolSuspended');
    expect(lifecycleErrorKey(refusal({}))).toBeNull();
  });
});

describe('daysLeft', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');
  it('rounds up to whole days and never goes below zero', () => {
    expect(daysLeft('2026-11-11T00:00:00Z', now)).toBe(10);
    expect(daysLeft('2026-11-01T06:00:00Z', now)).toBe(1);
    expect(daysLeft('2026-10-01T00:00:00Z', now)).toBe(0);
  });
  it('is null without a usable date', () => {
    expect(daysLeft(null, now)).toBeNull();
    expect(daysLeft('soon', now)).toBeNull();
  });
});

describe('announceSchoolRefusal', () => {
  it('announces a read-only refusal and still rejects with it', async () => {
    const heard: string[] = [];
    const off = onSchoolNotActive(key => heard.push(key));
    const error = refusal({ code: 'SCHOOL_NOT_ACTIVE', schoolStatus: 'closed' });

    await expect(announceSchoolRefusal(Promise.reject(error))).rejects.toBe(error);
    expect(heard).toEqual(['schoolClosed']);
    off();
  });

  it('stays quiet for other failures and for success', async () => {
    const heard: string[] = [];
    const off = onSchoolNotActive(key => heard.push(key));

    await expect(announceSchoolRefusal(Promise.reject(refusal({ code: 'X' })))).rejects.toBeDefined();
    await expect(announceSchoolRefusal(Promise.resolve(1))).resolves.toBe(1);
    expect(heard).toEqual([]);
    off();
  });
});

describe('isObsoleteHistoryOnly', () => {
  it('is history only when the school kept the course or the school is closed or gone', () => {
    expect(isObsoleteHistoryOnly({ maintenanceSource: 'school' })).toBe(true);
    expect(isObsoleteHistoryOnly({ maintenanceSource: 'author', schoolStatus: 'closed' })).toBe(true);
    expect(isObsoleteHistoryOnly({ schoolStatus: 'purged' })).toBe(true);
  });

  it('lets learners carry on with a course its author retired', () => {
    expect(isObsoleteHistoryOnly({ maintenanceSource: 'author', schoolStatus: 'active' })).toBe(false);
    expect(isObsoleteHistoryOnly({ maintenanceSource: null, schoolStatus: 'suspended' })).toBe(false);
    expect(isObsoleteHistoryOnly({})).toBe(false);
  });
});

describe('toMaintenanceSource', () => {
  it('keeps the two known sources and drops anything else', () => {
    expect(toMaintenanceSource('author')).toBe('author');
    expect(toMaintenanceSource('school')).toBe('school');
    expect(toMaintenanceSource('teacher')).toBeNull();
    expect(toMaintenanceSource(undefined)).toBeNull();
  });
});
