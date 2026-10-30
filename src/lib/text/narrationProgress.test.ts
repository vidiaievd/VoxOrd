import { paragraphTones } from './narrationProgress';

describe('paragraphTones', () => {
  const lengths = [100, 100, 200];

  it('leaves every paragraph plain until a recording has started', () => {
    expect(paragraphTones(lengths, { started: false, position: 0, duration: 60 })).toEqual([
      'plain',
      'plain',
      'plain',
    ]);
  });

  it('leaves them plain while the duration is unknown', () => {
    expect(paragraphTones(lengths, { started: true, position: 5, duration: 0 })).toEqual([
      'plain',
      'plain',
      'plain',
    ]);
  });

  it('starts on the first paragraph', () => {
    expect(paragraphTones(lengths, { started: true, position: 0, duration: 40 })).toEqual([
      'current',
      'unread',
      'unread',
    ]);
  });

  it('spreads the position by paragraph length', () => {
    // 15 s of 40 s = 37.5% of 400 characters = 150 → inside the second paragraph.
    expect(paragraphTones(lengths, { started: true, position: 15, duration: 40 })).toEqual([
      'read',
      'current',
      'unread',
    ]);
    // 30 s = 75% = 300 → inside the third, which is twice as long as the others.
    expect(paragraphTones(lengths, { started: true, position: 30, duration: 40 })).toEqual([
      'read',
      'read',
      'current',
    ]);
  });

  it('stays on the last paragraph at the end and clamps a position past the clip', () => {
    expect(paragraphTones(lengths, { started: true, position: 99, duration: 40 })).toEqual([
      'read',
      'read',
      'current',
    ]);
  });

  it('copes with no paragraphs', () => {
    expect(paragraphTones([], { started: true, position: 1, duration: 2 })).toEqual([]);
  });
});
