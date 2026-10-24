import { contents, item, unit } from './__fixtures__/unitContents';
import { itemsInOrder, nextItem } from './nextItem';

describe('itemsInOrder', () => {
  it('lists sections in order, then the ungrouped rest', () => {
    const c = contents([[item('a', 'available')], [item('b', 'available')]], [item('z', 'available')]);
    expect(itemsInOrder(c).map((i) => i.id)).toEqual(['a', 'b', 'z']);
  });
});

describe('nextItem', () => {
  it('takes the material already begun over an earlier open one', () => {
    const course = { units: [unit(0, 'active')] };
    const c = contents([[item('a', 'available'), item('b', 'in_progress')]]);
    expect(nextItem(course, { u0: c })).toEqual({ unitId: 'u0', item: c.sections[0].items[1] });
  });

  it('else the first open material, skipping what is done or handed in', () => {
    const course = { units: [unit(0, 'active')] };
    const c = contents([
      [item('a', 'completed'), item('b', 'submitted')],
      [item('c', 'locked'), item('d', 'available')],
    ]);
    expect(nextItem(course, { u0: c })?.item.id).toBe('d');
  });

  it('never opens a container heading', () => {
    const course = { units: [unit(0, 'active')] };
    const c = contents([[item('box', 'available', 'container'), item('l', 'available', 'lesson')]]);
    expect(nextItem(course, { u0: c })?.item.id).toBe('l');
  });

  it('moves on to a later open unit when the first active one has nothing left', () => {
    const course = { units: [unit(2, 'locked'), unit(1, 'active'), unit(0, 'active')] };
    const done = contents([[item('a', 'completed'), item('b', 'submitted')]]);
    const next = contents([[item('c', 'available')]]);
    expect(nextItem(course, { u0: done, u1: next })).toEqual({ unitId: 'u1', item: next.sections[0].items[0] });
  });

  it('stops at a unit whose contents are not known rather than skip past it', () => {
    const course = { units: [unit(0, 'active'), unit(1, 'active')] };
    const done = contents([[item('a', 'completed')]]);
    expect(nextItem(course, { u0: done, u2: contents([[item('x', 'available')]]) })).toBeNull();
  });

  it('has nothing for a finished course', () => {
    expect(nextItem({ units: [unit(0, 'done'), unit(1, 'done')] }, {})).toBeNull();
  });
});
