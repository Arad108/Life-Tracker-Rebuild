import { useColorScheme } from 'react-native';

/**
 * Design tokens recovered from the shipped bundle
 * (decompiled2.js:367129-367142). Do not invent values here.
 */

export interface ThemeColors {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
  warning: string;
}

export const lightTheme: ThemeColors = {
  dark: false,
  bg: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EDECE8',
  border: '#E3E1DB',
  text: '#16171A',
  textMuted: '#6B6D73',
  primary: '#16171A',
  onPrimary: '#FFFFFF',
  danger: '#D64545',
  success: '#1F9D6B',
  warning: '#C98A12',
};

export const darkTheme: ThemeColors = {
  dark: true,
  bg: '#0F1012',
  surface: '#17181C',
  surfaceAlt: '#212228',
  border: '#2A2C33',
  text: '#ECEDEF',
  textMuted: '#9A9CA3',
  primary: '#ECEDEF',
  onPrimary: '#0F1012',
  danger: '#F07272',
  success: '#3DD598',
  warning: '#E9B44C',
};

export const accents = {
  finance: '#1F9D6B',
  water: '#2B8EF0',
  workout: '#E5533D',
  wardrobe: '#C2738A',
  social: '#7C5CE0',
  learning: '#4C6FFF',
  habits: '#16A34A',
  goals: '#E08A1E',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 20, sheet: 28, pill: 999 };
export const GUTTER = 20;
export const TOUCH = 48;

export function useTheme(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightTheme : darkTheme;
}
