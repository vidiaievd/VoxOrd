import React, { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { ModalProvider } from './ModalProvider';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from '../components/ui/Toast';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ModalProvider>
            <ToastProvider>{children}</ToastProvider>
          </ModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});