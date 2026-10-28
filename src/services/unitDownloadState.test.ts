import type { UnitSummary } from '../api/types';

jest.mock('./courseDownload', () => ({
  // The real window rule, without the module's storage and network imports.
  unitWindow: (units: { id: string; status: string }[], ahead: number) => {
    const first = units.findIndex(u => u.status !== 'done');
    const from = first === -1 ? units.length - 1 : first;
    return units.slice(from, from + 1 + ahead);
  },
}));

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

describe('unitDownload', () => {
  it('is done for a unit in the window after a clean walk', () => {
    expect(unitDownload('u3', units, 1, finished)).toEqual({ state: 'done', inWindow: true });
  });

  it('is none outside the window, whatever the walk did', () => {
    expect(unitDownload('u4', units, 1, finished)).toEqual({ state: 'none', inWindow: false });
    expect(unitDownload('u1', units, 1, finished)).toEqual({ state: 'none', inWindow: false });
  });

  it('is downloading while a walk runs', () => {
    const running = { running: true, lastFinishedAt: null, lastFailed: 0 };
    expect(unitDownload('u2', units, 1, running).state).toBe('downloading');
  });

  it('is none before any walk finished, or after one with failures', () => {
    expect(unitDownload('u2', units, 1, { running: false, lastFinishedAt: null, lastFailed: 0 }).state).toBe('none');
    expect(unitDownload('u2', units, 1, { running: false, lastFinishedAt: 1, lastFailed: 2 }).state).toBe('none');
  });
});
