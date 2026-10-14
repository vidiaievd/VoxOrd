import { useEffect, useRef } from 'react';
import type { FooterAction } from './ExerciseBody';

/**
 * A body's button in the runner's footer, declared where the body draws its controls.
 *
 * A component rather than a hook because a body works out its stage after its early returns
 * — loading, the gate screen, the summary — where a hook cannot stand. Rendered, it puts
 * `action` in the footer; not rendered, it gives the footer back.
 *
 * The footer is told again only when something it shows changes. The presses always reach
 * the latest handlers through a ref, so a handler rebuilt on every render neither re-sends
 * the button nor goes stale — and the runner's own re-render, which re-renders the body,
 * cannot loop back into another update.
 */
export function BodyFooter({
  set,
  action,
}: {
  set: ((action: FooterAction | null) => void) | undefined;
  action: FooterAction | null;
}) {
  const latest = useRef(action);
  latest.current = action;

  const shown =
    action === null
      ? null
      : JSON.stringify([
          action.label,
          action.disabled ?? false,
          action.busy ?? false,
          action.note ?? null,
          action.error ?? null,
          action.secondary?.label ?? null,
          action.secondary?.disabled ?? false,
        ]);

  useEffect(() => {
    if (!set) return;
    const current = latest.current;
    if (current === null) {
      set(null);
      return;
    }
    set({
      ...current,
      onPress: () => latest.current?.onPress(),
      secondary: current.secondary && {
        ...current.secondary,
        onPress: () => latest.current?.secondary?.onPress(),
      },
    });
  }, [set, shown]);

  useEffect(() => () => set?.(null), [set]);

  return null;
}
