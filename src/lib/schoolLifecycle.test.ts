import { ApiError } from '../api/client';
import {
  announceSchoolRefusal,
  daysLeft,
  lifecycleErrorKey,
  onSchoolNotActive,
  schoolNotActiveStatus,
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
