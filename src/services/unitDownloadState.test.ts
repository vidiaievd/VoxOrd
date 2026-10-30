import type { UnitSummary } from '../api/types';

jest.mock('./courseDownload', () => ({
  // The real window rule, without the module's storage and network imports.
  unitWindow: (units: { id: string; status: string }[], ahead: number) => {
    if (ahead === -1) return units;
    const first = units.findIndex(u => u.status !== 'done');
    const from = first === -1 ? units.length - 1 : first;
    return units.slice(from, from + 1 + ahead);
  },
}));

import type { UnitProgress } from './courseDownload';
import { unitDownload } from './unitDownloadState';

const unit = (id: string, status: UnitSummary['status']): UnitSummary => ({
  id,
  position: 0,
  title: id,
  status,
  completedLessons: 0,
  totalLessons: 1,
});
const units = [unit('u1', 'done'), unit('u2', 'active'), unit('u3', 'active'), unit('u4', 'active')];
const finished = { running: false, lastFinishedAt: 1, lastFailed: 0 };
const progress = (complete: boolean, items: UnitProgress['items'], sizeBytes: number | null = null): UnitProgress => ({
  complete,
  items,
  sizeBytes,
});

describe('unitDownload without an account of the walk', () => {
  it('is done for a unit in the window after a clean walk, size unknown', () => {
    expect(unitDownload('u3', units, 1, finished)).toMatchObject({
      state: 'done',
      inWindow: true,
      progress: null,
      sizeBytes: null,
    });
  });

  it('is none outside the window', () => {
    expect(unitDownload('u4', units, 1, finished)).toMatchObject({ state: 'none', inWindow: false });
    expect(unitDownload('u1', units, 1, finished).state).toBe('none');
  });

  it('is downloading while a walk runs', () => {
    expect(unitDownload('u2', units, 1, { running: true, lastFinishedAt: null, lastFailed: 0 }).state).toBe('downloading');
  });

  it('is none before any walk finished, or after one with failures', () => {
    expect(unitDownload('u2', units, 1, { running: false, lastFinishedAt: null, lastFailed: 0 }).state).toBe('none');
    expect(unitDownload('u2', units, 1, { running: false, lastFinishedAt: 1, lastFailed: 2 }).state).toBe('none');
  });

  it('puts every unit of a course kept whole in the window', () => {
    expect(unitDownload('u4', units, 1, finished, undefined, true)).toMatchObject({ state: 'done', inWindow: true });
  });
});

describe('unitDownload with the walk\'s account', () => {
  it('counts materials fetched while the walk is on the unit', () => {
    const p = progress(false, { a: 'done', b: 'downloading', c: 'queued', d: 'queued' });
    expect(unitDownload('u2', units, 1, finished, p)).toMatchObject({ state: 'downloading', progress: 0.25 });
  });

  it('is done, with its size, when the walk closed it and every material is in', () => {
    const p = progress(true, { a: 'done', b: 'done' }, 5_000_000);
    expect(unitDownload('u2', units, 1, finished, p)).toMatchObject({ state: 'done', progress: 1, sizeBytes: 5_000_000 });
  });

  it('is none when the walk closed it with a material missing', () => {
    expect(unitDownload('u2', units, 1, finished, progress(true, { a: 'done', b: 'failed' })).state).toBe('none');
    expect(unitDownload('u2', units, 1, finished, progress(true, { a: 'done', b: 'queued' })).state).toBe('none');
  });

  it('is none for a unit whose contents could not be fetched', () => {
    expect(unitDownload('u2', units, 1, finished, progress(true, {})).state).toBe('none');
  });

  it('hands the per-material states on to the rows', () => {
    const p = progress(false, { a: 'done', b: 'queued' });
    expect(unitDownload('u2', units, 1, finished, p).items).toEqual({ a: 'done', b: 'queued' });
  });
});
