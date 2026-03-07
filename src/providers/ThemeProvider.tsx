import React, {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { ColorScheme, lightColors, darkColors } from '../theme/colors';
import { useSettings } from '../hooks/useSettings';
import { ThemeMode } from '../store/settingsStore';

interface ThemeContextValue {
  colors:    ColorScheme;
  isDark:    boolean;
  themeMode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors:    lightColors,
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

  return (
    <ThemeContext.Provider value={{ colors, isDark, themeMode: theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}