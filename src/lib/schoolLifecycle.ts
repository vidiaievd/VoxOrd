import { ApiError } from '../api/client';

/** Where a school stands in its lifecycle (plan 90, phase 5). Mirrors organization-service. */
export type SchoolLifecycleStatus = 'active' | 'suspended' | 'closed' | 'purged';

/** Whether a course is still looked after (content-service `maintenanceStatus`). */
export type MaintenanceStatus = 'maintained' | 'unmaintained' | 'obsolete';

export const SCHOOL_NOT_ACTIVE = 'SCHOOL_NOT_ACTIVE';

type Body = { error?: unknown; code?: unknown; status?: unknown; schoolStatus?: unknown; message?: unknown };

/**
 * The services answer in three shapes: organization `{ error: { code, status } }`,
 * exercise-engine `{ code, schoolStatus }`, and a plain `{ error: 'CODE' }` or
 * `{ message: 'CODE' }`. Flattens them to `{ code, status }`; anything else is `null`.
 */
function readCode(body: unknown): { code: string; status: unknown } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Body;
  if (b.error && typeof b.error === 'object') {
    const e = b.error as Body;
    if (typeof e.code === 'string') return { code: e.code, status: e.status ?? e.schoolStatus };
  }
  if (typeof b.code === 'string') return { code: b.code, status: b.schoolStatus ?? b.status };
  if (typeof b.error === 'string') return { code: b.error, status: undefined };
  if (typeof b.message === 'string') return { code: b.message, status: undefined };
  return null;
}

/**
 * The school's status behind a "school is read only" refusal, `purged` kept apart (the offline
 * queue gives up on a purged school, plan 90 Q16), else `null`. A refusal that does not say why
 * still means "not open"; `suspended` is the milder reading.
 */
export function schoolRefusalStatus(error: unknown): 'suspended' | 'closed' | 'purged' | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = readCode(error.body) ?? (error.code ? { code: error.code, status: undefined } : null);
  if (!parsed || parsed.code !== SCHOOL_NOT_ACTIVE) return null;
  if (parsed.status === 'purged') return 'purged';
  return parsed.status === 'closed' ? 'closed' : 'suspended';
}

/**
 * `suspended` / `closed` when `error` is the "school is read only" refusal, else `null`; a
 * purged school words as a closed one.
 */
export function schoolNotActiveStatus(error: unknown): 'suspended' | 'closed' | null {
  const status = schoolRefusalStatus(error);
  return status === 'purged' ? 'closed' : status;
}

/** Translation key under `schoolLifecycle.errors` for a refusal, or `null` if it is not one. */
export function lifecycleErrorKey(error: unknown): 'schoolSuspended' | 'schoolClosed' | null {
  const status = schoolNotActiveStatus(error);
  if (status === null) return null;
  return status === 'closed' ? 'schoolClosed' : 'schoolSuspended';
}

/** Whole days from `now` to `iso`, rounded up; `null` for a missing or unreadable date. */
export function daysLeft(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 86_400_000));
}

/** A school status read from a response, or `undefined` when the service sent none we know. */
export function toSchoolStatus(value: unknown): SchoolLifecycleStatus | undefined {
  return value === 'active' || value === 'suspended' || value === 'closed' || value === 'purged'
    ? value
    : undefined;
}

export function toMaintenanceStatus(value: unknown): MaintenanceStatus | undefined {
  return value === 'maintained' || value === 'unmaintained' || value === 'obsolete' ? value : undefined;
}

/** Who set a course's maintenance status: its author or its school's lifecycle. */
export type MaintenanceSource = 'author' | 'school';

export function toMaintenanceSource(value: unknown): MaintenanceSource | null {
  return value === 'author' || value === 'school' ? value : null;
}

/**
 * An obsolete course a learner can only look back on (plan 90, Q11; mirrors the web's
 * `isObsoleteHistoryOnly`): the school's purge kept it (`maintenanceSource: school`), or its
 * school is closed or gone — the engine refuses a start. A course its author retired is still
 * studied by those already on it.
 */
export function isObsoleteHistoryOnly(course: {
  maintenanceSource?: MaintenanceSource | null;
  schoolStatus?: SchoolLifecycleStatus;
}): boolean {
  return (
    course.maintenanceSource === 'school' ||
    course.schoolStatus === 'closed' ||
    course.schoolStatus === 'purged'
  );
}

type RefusalListener = (key: 'schoolSuspended' | 'schoolClosed') => void;
const listeners = new Set<RefusalListener>();

/** Hears every live attempt call the learner's school refused as read only (one notice words it). */
export function onSchoolNotActive(listener: RefusalListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Passes `promise` through; a "school is read only" refusal is announced before it propagates. */
export function announceSchoolRefusal<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((e: unknown) => {
    const key = lifecycleErrorKey(e);
    if (key) listeners.forEach(l => l(key));
    throw e;
  });
}
