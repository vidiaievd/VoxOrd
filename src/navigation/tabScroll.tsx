import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type RefObject,
} from 'react';
import type { FlatList, ScrollView } from 'react-native';
import type { Tab } from './screens';

/**
 * Tapping the tab you are already on, at its root, scrolls that root back to the top. The
 * root registers its list here; the tab bar asks for it by tab. A root that registers
 * nothing simply does not scroll.
 */
type ScrollToTop = () => void;
type Registry = Map<Tab, ScrollToTop>;

const TabScrollContext = createContext<Registry | null>(null);

export function TabScrollProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef<Registry>(new Map()).current;
  return (
    <TabScrollContext.Provider value={registry}>
      {children}
    </TabScrollContext.Provider>
  );
}

/** The navigator's side: scroll `tab`'s root to the top, if it registered a list. */
export function useScrollTabToTop(): (tab: Tab) => void {
  const registry = useContext(TabScrollContext);
  return useCallback((tab: Tab) => registry?.get(tab)?.(), [registry]);
}

type Scrollable =
  | Pick<ScrollView, 'scrollTo'>
  | Pick<FlatList<unknown>, 'scrollToOffset'>;

/** A tab root's side: hand over the list that should go back to the top. */
export function useTabScrollToTop(tab: Tab, ref: RefObject<Scrollable | null>) {
  const registry = useContext(TabScrollContext);

  useEffect(() => {
    if (!registry) return;
    const scroll: ScrollToTop = () => {
      const list = ref.current;
      if (!list) return;
      if ('scrollToOffset' in list)
        list.scrollToOffset({ offset: 0, animated: true });
      else list.scrollTo({ y: 0, animated: true });
    };
    registry.set(tab, scroll);
    return () => {
      if (registry.get(tab) === scroll) registry.delete(tab);
    };
  }, [registry, tab, ref]);
}
