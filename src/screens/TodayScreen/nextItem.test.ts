import { contents, item, unit } from '../../lib/__fixtures__/unitContents';
import { resolveResume, type ResumeInputs } from './nextItem';

const base: ResumeInputs = {
  units: [],
  unitContents: {},
  downloadedUnitIds: new Set(),
  offline: false,
};

describe('resolveResume', () => {
  it('opens the exact next material, with up to two still to do after it', () => {
    const c = contents([
      [item('a', 'completed'), item('b', 'in_progress'), item('c', 'submitted')],
      [item('d', 'locked'), item('e', 'available'), item('f', 'available')],
    ]);
    const r = resolveResume({ ...base, units: [unit(0, 'active')], unitContents: { u0: c } });
    expect(r?.kind).toBe('item');
    if (r?.kind !== 'item') return;
    expect(r.next.item.id).toBe('b');
    expect(r.upcoming.map((u) => u.item.id)).toEqual(['d', 'e']);
    expect([r.done, r.total]).toEqual([1, 6]);
    expect(r.next.meta).toEqual({ type: 'exercise', minutes: 5, availability: null });
  });

  it('marks a downloaded unit as on the phone, and an absent one offline as needing network', () => {
    const units = [unit(0, 'active')];
    const unitContents = { u0: contents([[item('a', 'available', 'vocabulary_list')]]) };
    const onPhone = resolveResume({ ...base, units, unitContents, downloadedUnitIds: new Set(['u0']), offline: true });
    const needsNet = resolveResume({ ...base, units, unitContents, offline: true });
    expect(onPhone?.kind === 'item' && onPhone.next.meta.availability).toBe('onPhone');
    expect(needsNet?.kind === 'item' && needsNet.next.meta).toEqual({
      type: 'vocabulary_list',
      minutes: 5,
      availability: 'needsNetwork',
    });
  });

  it('falls back to the unit when its contents are not reachable', () => {
    const r = resolveResume({ ...base, units: [unit(0, 'done'), unit(1, 'active')] });
    expect(r).toEqual({ kind: 'unit', unit: unit(1, 'active') });
  });

  it('falls back to the unit when nothing in it can be opened now', () => {
    const r = resolveResume({
      ...base,
      units: [unit(0, 'active')],
      unitContents: { u0: contents([[item('a', 'submitted'), item('b', 'locked')]]) },
    });
    expect(r?.kind).toBe('unit');
  });

  it('a finished course offers its last unit as done', () => {
    const r = resolveResume({ ...base, units: [unit(0, 'done'), unit(1, 'done')] });
    expect(r).toEqual({ kind: 'courseDone', unit: unit(1, 'done') });
  });

  it('a course with no units has no card', () => {
    expect(resolveResume(base)).toBeNull();
  });
});
