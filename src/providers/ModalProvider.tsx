import { createContext, ReactNode, useCallback, useContext, useState } from 'react';
import { ModalRenderer } from '../components/modal/ModalRenderer';
import { PickerOption } from '../components/modal/sheets/BottomSheetPicker';
import type { ReaderGlossaryEntry } from '../api/lessons';

export type ModalConfig =
  | {
      type: 'picker';
      title: string;
      options: PickerOption<any>[];
      current: any;
      closeLabel?: string;
      onSelect: (value: any) => void;
    }
  | {
      type: 'confirm';
      title: string;
      message: string;
      confirmLabel?: string;
      cancelLabel?: string;
      onConfirm: () => void;
    }
  | {
      type: 'glossary';
      entry: ReaderGlossaryEntry;
    };

export interface ModalContextValue {
  show: (config: ModalConfig) => void;
  hide: () => void;
  config: ModalConfig | null;
}

export const ModalContext = createContext<ModalContextValue>({
  show: () => {},
  hide: () => {},
  config: null,
});

export function useModal() {
  return useContext(ModalContext);
}

export function ModalProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ModalConfig | null>(null);

  const show = useCallback((c: ModalConfig) => setConfig(c), []);
  const hide = useCallback(() => setConfig(null), []);

  return (
    <ModalContext.Provider value={{ show, hide, config }}>
      {children}
      <ModalRenderer config={config} onClose={hide}/>
    </ModalContext.Provider>
  );
}
