import type { UnitContentsItem } from '../../api/types';
import { firstChangedItem } from './changedItem';

const item = (id: string, status: UnitContentsItem['status']): UnitContentsItem => ({
  id,
  contentType: 'lesson',
  contentId: id,
  title: id,
  lessonKind: null,
  durationMinutes: null,
  xpReward: null,
  status,
  masteryPercent: null,
});

describe('firstChangedItem', () => {
  it('finds the first row whose status moved', () => {
    const before = [item('a', 'completed'), item('b', 'in_progress'), item('c', 'available')];
    const after = [item('a', 'completed'), item('b', 'completed'), item('c', 'in_progress')];
    expect(firstChangedItem(before, after)?.id).toBe('b');
  });

  it('is null when nothing changed', () => {
    const rows = [item('a', 'available')];
    expect(firstChangedItem(rows, rows)).toBeNull();
  });

  it('ignores items the earlier copy did not have', () => {
    expect(firstChangedItem([item('a', 'available')], [item('a', 'available'), item('n', 'locked')])).toBeNull();
  });
});
