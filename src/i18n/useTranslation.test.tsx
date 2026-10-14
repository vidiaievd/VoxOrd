import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useTranslation } from './index';

describe('useTranslation', () => {
  // A body puts its footer button in the runner through an effect with `t` among its
  // dependencies. A new `t` per render re-ran that effect on every render the runner's own
  // update caused: a loop that never shows on screen and never stops.
  it('hands back the same t across renders for one language', () => {
    const seen: unknown[] = [];
    function Probe({ tick }: { tick: number }) {
      const { t } = useTranslation();
      seen.push(t);
      return <>{tick}</>;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<Probe tick={1} />);
    });
    act(() => {
      renderer.update(<Probe tick={2} />);
    });

    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });
});
