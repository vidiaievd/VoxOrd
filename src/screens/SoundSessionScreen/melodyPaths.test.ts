import { melodyPaths } from './melodyPaths';

describe('melodyPaths', () => {
  it('draws one path per voiced run and breaks the line at a gap', () => {
    const out = melodyPaths({ stepMs: 10, learner: [1, 2, null, 3, 4], reference: [1, 2, 3] });
    expect(out?.yours).toHaveLength(2);
    expect(out?.model).toHaveLength(1);
    expect(out?.yours[0]).toMatch(/^M8\.0 /);
  });

  it('puts both curves on one scale and stretches each over the word', () => {
    const out = melodyPaths({ stepMs: 10, learner: [0, 10], reference: [0, 5, 10] });
    // lowest value at the bottom (y = 112), highest at the top (y = 8), last point at the right edge.
    expect(out?.yours[0]).toBe('M8.0 112.0 L312.0 8.0');
    expect(out?.model[0]).toBe('M8.0 112.0 L160.0 60.0 L312.0 8.0');
  });

  it('says nothing when there is nothing to compare', () => {
    expect(melodyPaths({ stepMs: 10, learner: [null], reference: [null, 1] })).toBeNull();
  });

  it('survives a flat curve', () => {
    expect(melodyPaths({ stepMs: 10, learner: [5, 5], reference: [5, 5] })?.yours).toHaveLength(1);
  });
});
