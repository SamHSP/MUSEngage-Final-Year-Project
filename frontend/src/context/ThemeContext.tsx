import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import { createAppTheme } from '../theme';

const THEME_STORAGE_KEY = 'musengage-theme-mode';

type ThemeMode = Extract<PaletteMode, 'light' | 'dark'>;

type ThemeContextValue = {
  mode: ThemeMode;
  darkMode: boolean;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getInitialTheme = (): { mode: ThemeMode; hasStoredPreference: boolean } => {
  if (typeof window === 'undefined') {
    return { mode: 'light', hasStoredPreference: false };
  }

  const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedValue === 'light' || storedValue === 'dark') {
    return { mode: storedValue, hasStoredPreference: true };
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { mode: prefersDark ? 'dark' : 'light', hasStoredPreference: false };
};

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const initialTheme = getInitialTheme();
  const [mode, setModeState] = useState<ThemeMode>(() => initialTheme.mode);
  const [hasStoredPreference, setHasStoredPreference] = useState<boolean>(() => initialTheme.hasStoredPreference);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    document.documentElement.dataset.themeMode = mode;
    if (hasStoredPreference) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } else {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    }
  }, [mode, hasStoredPreference]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasStoredPreference) {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setModeState(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [hasStoredPreference]);

  const toggleTheme = useCallback(() => {
    setHasStoredPreference(true);
    setModeState((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setHasStoredPreference(true);
    setModeState(newMode);
  }, []);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      darkMode: mode === 'dark',
      toggleTheme,
      setMode,
    }),
    [mode, toggleTheme, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
