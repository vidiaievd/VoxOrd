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
 * `suspended` / `closed` when `error` is the "school is read only" refusal, else `null`. A
 * refusal that does not say why still means "not open"; `suspended` is the milder wording.
 */
export function schoolNotActiveStatus(error: unknown): 'suspended' | 'closed' | null {
  if (!(error instanceof ApiError)) return null;
  const parsed = readCode(error.body) ?? (error.code ? { code: error.code, status: undefined } : null);
  if (!parsed || parsed.code !== SCHOOL_NOT_ACTIVE) return null;
  return parsed.status === 'closed' || parsed.status === 'purged' ? 'closed' : 'suspended';
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
