export const theme = {
  colors: {
    primary: '#4F46E5', // Indigo
    primaryLight: '#EEF2FF',
    primaryDark: '#3730A3',
    secondary: '#0EA5E9', // Sky
    secondaryLight: '#E0F2FE',
    accent: '#8B5CF6', // Purple
    accentLight: '#F3E8FF',
    success: '#10B981', // Emerald
    successLight: '#D1FAE5',
    warning: '#F59E0B',
    warningLight: '#FEF3C7',
    danger: '#EF4444',
    error: '#EF4444',

    // Backgrounds & Neutrals
    background: '#F8FAFC',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    cardBorder: '#E2E8F0',
    border: '#E2E8F0',
    text: '#0F172A', // Slate 900
    textPrimary: '#0F172A',
    textSecondary: '#64748B', // Slate 500
    textTertiary: '#94A3B8',
    textMuted: '#94A3B8', // Slate 400
    divider: '#F1F5F9',

    // Gradients / Badges / Status
    badgeOnline: '#22C55E',
    badgeOffline: '#CBD5E1',
    online: '#22C55E',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 14,
    lg: 20,
    full: 9999,
  },
  shadows: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 2,
    },
    floating: {
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 5,
    },
  },
} as const;

export type Theme = typeof theme;
export default theme;
