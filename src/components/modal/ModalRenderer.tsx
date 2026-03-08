import React from 'react';
import { ModalConfig } from '../../providers/ModalProvider';
import { ConfirmSheet } from './sheets/ConfirmSheet';
import { BottomSheetPicker } from './sheets/BottomSheetPicker';

interface ModalRendererProps {
  config: ModalConfig | null;
  onClose: () => void;
}

export function ModalRenderer({ config, onClose }: ModalRendererProps) {
  if (!config) return null;

  switch (config.type) {
    case 'picker':
      return (
        <BottomSheetPicker
          visible
          title={config.title}
          options={config.options}
          current={config.current}
          closeLabel={config.closeLabel}
          onSelect={value => {
            config.onSelect(value);
            onClose();
          }}
          onClose={onClose}
        />
      );

    case 'confirm':
      return (
        <ConfirmSheet
          visible
          title={config.title}
          message={config.message}
          confirmLabel={config.confirmLabel}
          cancelLabel={config.cancelLabel}
          onConfirm={() => {
            config.onConfirm();
            onClose();
          }}
          onClose={onClose}
        />
      );

    default:
      return null;
  }
}
