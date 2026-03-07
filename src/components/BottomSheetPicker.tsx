import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';

export interface PickerOption<T> {
  value: T;
  label: string;
  icon?: string;
  badge?: string;
}

interface BottomSheetPickerProps<T> {
  visible: boolean;
  title: string;
  options: PickerOption<T>[];
  current: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  closeLabel?: string;
}

export function BottomSheetPicker<T>({
  visible,
  title,
  options,
  current,
  onSelect,
  onClose,
  closeLabel = 'Close',
}: BottomSheetPickerProps<T>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.handle} />

        <Text style={styles.title}>{title}</Text>

        <ScrollView bounces={false}>
          {options.map((option, index) => {
            const isSelected = option.value === current;
            const isLast = index === options.length - 1;

            return (
              <TouchableOpacity
                key={String(option.value)}
                style={[styles.row, isLast && styles.rowLast]}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                {option.icon && <Text style={styles.icon}>{option.icon}</Text>}

                <Text
                  style={[styles.label, isSelected && styles.labelSelected]}
                >
                  {option.label}
                </Text>

                {option.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{option.badge}</Text>
                  </View>
                )}

                {isSelected && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>{closeLabel}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f7',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f7',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  icon: {
    fontSize: 26,
    marginRight: 16,
    width: 36,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    color: '#1a1a2e',
    flex: 1,
  },
  labelSelected: {
    fontWeight: '700',
    color: '#6c63ff',
  },
  badge: {
    backgroundColor: '#f0f0f7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: '#6c63ff',
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 8,
    marginHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f7',
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
});
