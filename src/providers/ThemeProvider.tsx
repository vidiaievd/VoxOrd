import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from 'react';
import { Platform, StatusBar, useColorScheme } from 'react-native';
import { ColorScheme, lightColors, darkColors } from '../theme/colors';
import { typography, Typography } from '../theme/typography';
import { useSettings } from '../hooks/useSettings';
import { ThemeMode } from '../store/settingsStore';

interface ThemeContextValue {
  colors:    ColorScheme;
  typography: Typography;
  isDark:    boolean;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors:    lightColors,
  typography,
  isDark:    false,
  themeMode: 'system',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { theme }    = useSettings();

  const isDark = useMemo(() => {
    switch (theme) {
      case 'dark':   return true;
      case 'light':  return false;
      case 'system': return systemScheme === 'dark';
    }
  }, [theme, systemScheme]);

  const colors = useMemo(
    () => isDark ? darkColors : lightColors,
    [isDark]
  );

  const value = useMemo(
    () => ({ colors, typography, isDark, themeMode: theme }),
    [colors, isDark, theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={Platform.OS === 'android' ? colors.bg : undefined}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}