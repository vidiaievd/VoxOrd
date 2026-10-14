import React, { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react';

/**
 * A screen's say over the phone's Back button, before the navigator takes it.
 *
 * The handler returns true when it dealt with the press — the exercise runner asks before
 * leaving a set mid-way — and false to let the navigator go back as usual. One handler at a
 * time: the navigator shows one screen.
 */
type Handler = () => boolean;

const BackInterceptContext = createContext<MutableRefObject<Handler | null> | null>(null);

export function BackInterceptProvider({
  handlerRef,
  children,
}: {
  handlerRef: MutableRefObject<Handler | null>;
  children: React.ReactNode;
}) {
  return (
    <BackInterceptContext.Provider value={handlerRef}>{children}</BackInterceptContext.Provider>
  );
}

/** Register `handler` for as long as the calling screen is mounted. */
export function useBackIntercept(handler: Handler | null) {
  const ref = useContext(BackInterceptContext);
  // The latest handler, read at press time, so the registration need not churn per render.
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!ref) return;
    const registered: Handler = () => latest.current?.() ?? false;
    ref.current = registered;
    return () => {
      if (ref.current === registered) ref.current = null;
    };
  }, [ref]);
}
