import {
  buildTextOrderAnswer,
  moveLine,
  placedFromScore,
  readTextOrderTask,
  shuffleOrder,
} from './textOrder';

describe('readTextOrderTask', () => {
  it('reads the seeded document', () => {
    const task = readTextOrderTask({
      kind: 'sentences',
      items: [
        { id: 'a', text: 'Bartek sitter foran datamaskinen.' },
        { id: 'b', text: 'Han finner en annonse.' },
        { id: '', text: 'no id' },
      ],
      context: 'Tekst 1A — Bartek søker ny jobb.',
    });
    expect(task).toEqual({
      kind: 'sentences',
      context: 'Tekst 1A — Bartek søker ny jobb.',
      lines: [
        { id: 'a', text: 'Bartek sitter foran datamaskinen.' },
        { id: 'b', text: 'Han finner en annonse.' },
      ],
    });
  });

  it('keeps speakers of a dialogue', () => {
    const task = readTextOrderTask({ kind: 'dialogue', items: [{ id: 'x', text: 'Hei!', speaker: 'Anne' }] });
    expect(task.kind).toBe('dialogue');
    expect(task.lines[0].speaker).toBe('Anne');
  });
});

describe('shuffleOrder', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  it('is deterministic per seed and a permutation', () => {
    const one = shuffleOrder(ids, 'e79dba50-4216-5996-8a84-fef5d899d495');
    expect(shuffleOrder(ids, 'e79dba50-4216-5996-8a84-fef5d899d495')).toEqual(one);
    expect([...one].sort()).toEqual(ids);
  });

  it('never deals the answer for two or more lines', () => {
    for (let n = 2; n <= 6; n++) {
      const list = ids.slice(0, n);
      for (let s = 0; s < 50; s++) {
        expect(shuffleOrder(list, `seed-${s}`)).not.toEqual(list);
      }
    }
    expect(shuffleOrder(['a'], 'x')).toEqual(['a']);
  });
});

describe('moveLine', () => {
  it('moves a line and shifts the rest', () => {
    expect(moveLine(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveLine(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('ignores moves out of range', () => {
    const order = ['a', 'b'];
    expect(moveLine(order, 0, -1)).toBe(order);
    expect(moveLine(order, 1, 2)).toBe(order);
  });
});

describe('answer and result', () => {
  it('sends the order as ids', () => {
    expect(buildTextOrderAnswer(['b', 'a'])).toEqual({ order: ['b', 'a'] });
  });

  it('recovers the lines in place from the score', () => {
    for (let total = 1; total <= 20; total++) {
      for (let placed = 0; placed <= total; placed++) {
        expect(placedFromScore(Math.round((100 * placed) / total), total)).toBe(placed);
      }
    }
    expect(placedFromScore(null, 8)).toBeNull();
  });
});
