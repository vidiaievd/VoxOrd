import { PickerOption } from '../BottomSheetPicker';

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
    };
// in the future: 'alert' | 'input' | 'custom' etc.
