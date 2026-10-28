import { createContext, useContext, useEffect, useRef } from 'react';

type Refresh = () => Promise<void>;

/**
 * Pull-to-refresh asks every source (Home spec §6.1). Blocks load their own data, so each
 * registers how to refetch it here and the screen runs them all with `Promise.all`.
 */
export const RefreshRegistry = createContext<Set<Refresh> | null>(null);

export function useRegisterRefresh(refresh: Refresh): void {
  const registry = useContext(RefreshRegistry);
  // The latest closure, registered once: a new `refresh` each render must not churn the set.
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!registry) return;
    const run: Refresh = () => latest.current();
    registry.add(run);
    return () => {
      registry.delete(run);
    };
  }, [registry]);
}
