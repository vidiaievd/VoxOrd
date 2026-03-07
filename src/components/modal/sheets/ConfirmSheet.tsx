import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';

interface ConfirmSheetProps {
  visible:       boolean;
  title:         string;
  message:       string;
  confirmLabel?: string;
  cancelLabel?:  string;
  onConfirm:     () => void;
  onClose:       () => void;
}

export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
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
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor:      '#fff',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingHorizontal:    24,
    paddingBottom:        32,
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: '#e0e0e0',
    borderRadius:    2,
    alignSelf:       'center',
    marginTop:       12,
    marginBottom:    16,
  },
  title: {
    fontSize:       18,
    fontWeight:     '700',
    color:          '#1a1a2e',
    textAlign:      'center',
    marginBottom:   8,
  },
  message: {
    fontSize:       15,
    color:          '#888',
    textAlign:      'center',
    marginBottom:   24,
    lineHeight:     22,
  },
  confirmBtn: {
    backgroundColor: '#6c63ff',
    borderRadius:    14,
    paddingVertical: 14,
    alignItems:      'center',
    marginBottom:    8,
  },
  confirmText: {
    fontSize:   15,
    fontWeight: '700',
    color:      '#fff',
  },
  cancelBtn: {
    backgroundColor: '#f0f0f7',
    borderRadius:    14,
    paddingVertical: 14,
    alignItems:      'center',
  },
  cancelText: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#888',
  },
});