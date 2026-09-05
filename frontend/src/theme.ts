import { alpha, createTheme, responsiveFontSizes } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';
import type { ButtonProps } from '@mui/material/Button';
import type { Theme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    aqua: Palette['primary'];
    pink: Palette['primary'];
    green: Palette['primary'];
    yellow: Palette['primary'];
    orange: Palette['primary'];
    neutrals: {
      100: string;
      300: string;
      500: string;
      700: string;
      900: string;
    };
  }

  interface PaletteOptions {
    aqua?: PaletteOptions['primary'];
    pink?: PaletteOptions['primary'];
    green?: PaletteOptions['primary'];
    yellow?: PaletteOptions['primary'];
    orange?: PaletteOptions['primary'];
    neutrals?: {
      100: string;
      300: string;
      500: string;
      700: string;
      900: string;
    };
  }
}

// Global Material UI theme tuned for the MUSEngage brand.
export const createAppTheme = (mode: PaletteMode) =>
  responsiveFontSizes(
    createTheme({
      palette: {
        mode,
        primary: {
          light: '#fa7d7d',
          main: '#e12744',
          dark: '#9e1331',
          contrastText: '#ffffff',
        },
        secondary: {
          light: '#92deee',
          main: '#008481',
          dark: '#0f5252',
          contrastText: '#ffffff',
        },
        error: {
          light: '#fa7d7d',
          main: '#9e1331',
          dark: '#681460',
          contrastText: '#ffffff',
        },
        warning: {
          light: '#fce079',
          main: '#f3a322',
          dark: '#c0570c',
          contrastText: '#000000',
        },
        success: {
          light: '#82bd69',
          main: '#4c8435',
          dark: '#345427',
          contrastText: '#ffffff',
        },
        info: {
          light: '#92deee',
          main: '#2174df',
          dark: '#0f5252',
          contrastText: '#ffffff',
        },
        background: mode === 'dark'
          ? {
            default: '#0a0a0a',
            paper: '#1a1a1a',
          }
          : {
            default: '#f3f3f3',
            paper: '#ffffff',
          },
        text: mode === 'dark'
          ? {
            primary: '#e5e7eb',
            secondary: '#9ca3af',
          }
          : {
            primary: '#1f2933',
            secondary: '#4b5563',
          },
        divider: mode === 'dark' ? alpha('#e5e7eb', 0.16) : alpha('#9e1331', 0.1),
        aqua: {
          light: '#92deee',
          main: '#20e4d3',
          dark: '#008481',
          contrastText: '#00403e',
        },
        pink: {
          light: '#edb0e4',
          main: '#cd3a8e',
          dark: '#681460',
          contrastText: '#ffffff',
        },
        green: {
          light: '#d3eac8',
          main: '#4c8435',
          dark: '#345427',
          contrastText: '#ffffff',
        },
        yellow: {
          light: '#fce079',
          main: '#f3a322',
          dark: '#774010',
          contrastText: '#000000',
        },
        orange: {
          light: '#f7d8a3',
          main: '#f15a33',
          dark: '#902e04',
          contrastText: '#ffffff',
        },
        neutrals: {
          100: '#f3f4f6',
          300: '#d1d5db',
          500: '#9ca3af',
          700: '#4b5563',
          900: '#1f2933',
        },
      },
      typography: {
        fontFamily: '"F37 Ginger", "Poppins", "Nunito Sans", "Segoe UI", sans-serif',
        h1: {
          fontWeight: 600,
          letterSpacing: '0.01em',
        },
        h2: {
          fontWeight: 600,
          letterSpacing: '0.01em',
        },
        h3: {
          fontWeight: 600,
        },
        h4: {
          fontWeight: 600,
        },
        subtitle1: {
          fontWeight: 400,
        },
        subtitle2: {
          fontWeight: 400,
        },
        body1: {
          fontWeight: 400,
        },
        body2: {
          fontWeight: 400,
        },
        button: {
          fontWeight: 600,
          letterSpacing: '0.02em',
        },
      },
      shape: {
        borderRadius: 16,
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: ({ theme }: { theme: Theme }) => ({
              backgroundImage:
                theme.palette.mode === 'dark'
                  ? 'radial-gradient(circle at top right, rgba(225, 39, 68, 0.12), transparent 55%),' +
                  'radial-gradient(circle at bottom left, rgba(0, 132, 129, 0.12), transparent 60%),' +
                  '#0a0a0a'
                  : 'radial-gradient(circle at top right, rgba(250, 125, 125, 0.08), transparent 55%),' +
                  'radial-gradient(circle at bottom left, rgba(224, 255, 250, 0.1), transparent 60%),' +
                  '#f3f3f3',
              transition: 'background-color 0.3s ease, color 0.3s ease',
            }),
          },
        },
        MuiAppBar: {
          defaultProps: {
            elevation: 0,
            color: 'inherit',
          },
          styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
              backgroundColor:
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.background.paper, 0.92)
                  : alpha('#ffffff', 0.92),
              backdropFilter: 'blur(16px)',
              borderBottom:
                theme.palette.mode === 'dark'
                  ? `1px solid ${alpha('#e5e7eb', 0.08)}`
                  : `1px solid ${alpha(theme.palette.primary.dark, 0.08)}`,
              borderRadius: `0 0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px`,
            }),
          },
        },
        MuiButton: {
          defaultProps: {
            disableElevation: true,
          },
          styleOverrides: {
            root: ({ ownerState, theme }: { ownerState: ButtonProps; theme: Theme }) => ({
              borderRadius: 3, //999,
              textTransform: 'none',
              paddingInline: theme.spacing(2.5),
              transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease',
              ...(ownerState.variant === 'contained' && {
                backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.primary.light, 0.4)}, ${theme.palette.primary.main})`,
              }),
            }),
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
              borderRadius: theme.shape.borderRadius,
              border:
                theme.palette.mode === 'dark'
                  ? `1px solid ${alpha('#e5e7eb', 0.08)}`
                  : `1px solid ${alpha(theme.palette.primary.dark, 0.05)}`,
              backgroundImage: 'none',
              transition: 'background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease',
            }),
          },
        },
        MuiCard: {
          defaultProps: {
            elevation: 0,
          },
          styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
              borderRadius: theme.shape.borderRadius,
              border:
                theme.palette.mode === 'dark'
                  ? `1px solid ${alpha('#e5e7eb', 0.12)}`
                  : `1px solid ${alpha(theme.palette.primary.dark, 0.08)}`,
              boxShadow:
                theme.palette.mode === 'dark'
                  ? '0 18px 45px rgba(0, 0, 0, 0.45)'
                  : '0 18px 45px rgba(14, 28, 37, 0.06)',
              transition: 'background-color 0.3s ease, border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease',
            }),
          },
        },
        MuiLink: {
          defaultProps: {
            underline: 'hover',
          },
          styleOverrides: {
            root: ({ theme }: { theme: Theme }) => ({
              fontWeight: 600,
              color: theme.palette.primary.main,
            }),
          },
        },
      },
    }),
  );

export const heroThemesLight = {
  default: 'linear-gradient(135deg, #9e1331, #e12744 55%, #fa7d7d)',
  dashboard: 'linear-gradient(135deg, #4b1f24, #e12744 60%, #fcdcd0)',
  community: 'linear-gradient(135deg, #4b1f24, #e12744 58%, #fa7d7d)',
  events: 'linear-gradient(135deg, #0f5252, #008481 60%, #92deee)',
  shop: 'linear-gradient(135deg, #681460, #cd3a8e 60%, #edb0e4)',
  rewards: 'linear-gradient(135deg, #774010, #f3a322 60%, #fce079)',
  feedback: 'linear-gradient(135deg, #902e04, #f15a33 60%, #f7d8a3)',
  qr: 'linear-gradient(135deg, #0f5252, #20e4d3 60%, #e0fffa)',
  profile: 'linear-gradient(135deg, #0f5252, #2174df 55%, #92deee)',
  neutral: 'linear-gradient(0deg, #f6f8fb, #f6f8fb)',
} as const;

export const heroThemesDark = {
  default: 'linear-gradient(135deg, #4a0614, #7a1827 55%, #4a0614)',
  dashboard: 'linear-gradient(135deg, #1a0a0d, #7a1827 60%, #2a1216)',
  community: 'linear-gradient(135deg, #1a0a0d, #7a1827 58%, #4a0614)',
  events: 'linear-gradient(135deg, #06282a, #004441 60%, #0a3e3c)',
  shop: 'linear-gradient(135deg, #2a0a24, #6a1c47 60%, #3d1030)',
  rewards: 'linear-gradient(135deg, #332008, #7a5111 60%, #4a300a)',
  feedback: 'linear-gradient(135deg, #3a1402, #7a2a19 60%, #4a1a0c)',
  qr: 'linear-gradient(135deg, #06282a, #0a5a57 60%, #0e3a38)',
  profile: 'linear-gradient(135deg, #06282a, #0d3a6f 55%, #0a3e3c)',
  neutral: 'linear-gradient(0deg, #1a1a1a, #1a1a1a)',
} as const;

export const heroThemes = (mode: PaletteMode) => (mode === 'dark' ? heroThemesDark : heroThemesLight);

export type HeroThemeKey = keyof typeof heroThemesLight;

export default createAppTheme;
