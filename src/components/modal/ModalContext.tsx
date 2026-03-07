import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { ModalConfig } from './types';
import { ModalRenderer } from './ModalRenderer';

interface ModalContextValue {
  show: (config: ModalConfig) => void;
  hide: () => void;
}

const ModalContext = createContext<ModalContextValue>({
  show: () => {},
  hide: () => {},
});

export function ModalProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ModalConfig | null>(null);

  const show = useCallback((c: ModalConfig) => setConfig(c), []);
  const hide = useCallback(() => setConfig(null), []);

  return (
    <ModalContext.Provider value={{ show, hide }}>
      {children}
      <ModalRenderer config={config} onClose={hide} />
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}