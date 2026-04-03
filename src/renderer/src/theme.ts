import { createTheme, rem, virtualColor } from '@mantine/core'

export const appTheme = createTheme({
  primaryColor: 'frc-blue',
  defaultRadius: 'lg',
  cursorType: 'pointer',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, SF Mono, Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(48), lineHeight: '1.15', fontWeight: '800' },
      h2: { fontSize: rem(36), lineHeight: '1.2', fontWeight: '700' },
      h3: { fontSize: rem(26), lineHeight: '1.3', fontWeight: '600' },
      h4: { fontSize: rem(20), lineHeight: '1.4', fontWeight: '600' },
      h5: { fontSize: rem(16), lineHeight: '1.5', fontWeight: '600' },
      h6: { fontSize: rem(14), lineHeight: '1.5', fontWeight: '600' },
    },
  },
  fontSizes: {
    xs: rem(11),
    sm: rem(13),
    md: rem(15),
    lg: rem(17),
    xl: rem(20),
  },
  spacing: {
    xs: rem(8),
    sm: rem(12),
    md: rem(18),
    lg: rem(26),
    xl: rem(36),
  },
  radius: {
    xs: rem(4),
    sm: rem(6),
    md: rem(10),
    lg: rem(14),
    xl: rem(20),
  },
  colors: {
    'frc-blue': [
      '#e8f4ff', // 0 - lightest
      '#c4e1ff', // 1
      '#8ec5ff', // 2
      '#52a7ff', // 3
      '#2b93ff', // 4 - vibrant
      '#1a8cff', // 5 - primary
      '#0d7de6', // 6
      '#0066cc', // 7
      '#004d99', // 8
      '#003366', // 9 - darkest
    ],
    'frc-orange': [
      '#fff5eb', // 0 - lightest
      '#ffe4cc', // 1
      '#ffc999', // 2
      '#ffad66', // 3
      '#ff9633', // 4 - vibrant
      '#ff8800', // 5 - primary
      '#e67a00', // 6
      '#cc6600', // 7
      '#994d00', // 8
      '#663300', // 9 - darkest
    ],
    'slate': [
      '#f8fafc', // 0 - text on dark
      '#e2e8f0', // 1 - secondary text
      '#cbd5e1', // 2 - dimmed text
      '#94a3b8', // 3 - muted
      '#64748b', // 4 - subtle
      '#475569', // 5 - borders
      '#334155', // 6 - elevated surfaces
      '#1e293b', // 7 - cards
      '#151c28', // 8 - sidebar
      '#0c1218', // 9 - main background
    ],
    'success': [
      '#ecfdf5',
      '#d1fae5',
      '#a7f3d0',
      '#6ee7b7',
      '#34d399',
      '#10b981',
      '#059669',
      '#047857',
      '#065f46',
      '#064e3b',
    ],
    'warning': [
      '#fffbeb',
      '#fef3c7',
      '#fde68a',
      '#fcd34d',
      '#fbbf24',
      '#f59e0b',
      '#d97706',
      '#b45309',
      '#92400e',
      '#78350f',
    ],
    'danger': [
      '#fef2f2',
      '#fee2e2',
      '#fecaca',
      '#fca5a5',
      '#f87171',
      '#ef4444',
      '#dc2626',
      '#b91c1c',
      '#991b1b',
      '#7f1d1d',
    ],
    // Virtual colors for semantic usage
    surface: virtualColor({
      name: 'surface',
      dark: 'slate',
      light: 'slate',
    }),
  },
  black: '#080c10',
  white: '#f8fafc',
  primaryShade: { light: 5, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.3,
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.25)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.45), 0 4px 8px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(29, 161, 242, 0.08)',
    md: '0 4px 8px rgba(0, 0, 0, 0.5), 0 8px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(29, 161, 242, 0.1)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.55), 0 16px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(29, 161, 242, 0.12)',
    xl: '0 16px 32px rgba(0, 0, 0, 0.6), 0 32px 64px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(29, 161, 242, 0.15)',
  },
  defaultGradient: {
    from: 'frc-blue.5',
    to: 'frc-orange.5',
    deg: 135,
  },
  components: {
    Button: {
      defaultProps: {
        fw: 600,
        size: 'md',
      },
      styles: {
        root: {
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
    },
    Card: {
      defaultProps: {
        padding: 'lg',
        radius: 'lg',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-slate-8)',
          borderColor: 'rgba(148, 163, 184, 0.1)',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-slate-8)',
        },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.7,
          blur: 8,
        },
      },
      styles: {
        content: {
          backgroundColor: 'var(--mantine-color-slate-8)',
          border: '1px solid rgba(148, 163, 184, 0.12)',
        },
        header: {
          backgroundColor: 'transparent',
        },
        title: {
          fontWeight: 600,
          color: 'var(--mantine-color-slate-0)',
        },
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-slate-9)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
          transition: 'all 0.2s ease',
          '&:focus': {
            borderColor: 'var(--mantine-color-frc-blue-5)',
            boxShadow: '0 0 0 2px rgba(29, 161, 242, 0.15)',
          },
        },
        label: {
          marginBottom: rem(6),
          fontWeight: 500,
          color: 'var(--mantine-color-slate-2)',
        },
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-slate-9)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        },
        dropdown: {
          backgroundColor: 'var(--mantine-color-slate-8)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        },
      },
    },
    Tabs: {
      styles: {
        tab: {
          fontWeight: 500,
          transition: 'all 0.2s ease',
          '&[data-active]': {
            color: 'var(--mantine-color-frc-blue-4)',
            borderColor: 'var(--mantine-color-frc-blue-4)',
          },
        },
      },
    },
    Badge: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 600,
          textTransform: 'none',
        },
      },
    },
    Tooltip: {
      defaultProps: {
        radius: 'md',
        withArrow: true,
        arrowSize: 6,
        transitionProps: { transition: 'pop', duration: 150 },
      },
      styles: {
        tooltip: {
          backgroundColor: 'var(--mantine-color-slate-7)',
          color: 'var(--mantine-color-slate-0)',
          fontSize: rem(12),
          fontWeight: 500,
          padding: `${rem(6)} ${rem(10)}`,
        },
      },
    },
    NavLink: {
      styles: {
        root: {
          borderRadius: rem(10),
          transition: 'all 0.2s ease',
          '&[data-active]': {
            backgroundColor: 'rgba(29, 161, 242, 0.12)',
          },
          '&:hover': {
            backgroundColor: 'rgba(148, 163, 184, 0.08)',
          },
        },
      },
    },
    ActionIcon: {
      styles: {
        root: {
          transition: 'all 0.2s ease',
        },
      },
    },
    ThemeIcon: {
      defaultProps: {
        radius: 'md',
      },
    },
    Progress: {
      styles: {
        root: {
          backgroundColor: 'rgba(148, 163, 184, 0.15)',
        },
      },
    },
    Skeleton: {
      styles: {
        root: {
          backgroundColor: 'rgba(148, 163, 184, 0.1)',
          '&::after': {
            background: 'linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.08), transparent)',
          },
        },
      },
    },
    Table: {
      styles: {
        table: {
          '--table-border-color': 'rgba(148, 163, 184, 0.1)',
        },
        th: {
          fontWeight: 600,
          color: 'var(--mantine-color-slate-2)',
          backgroundColor: 'var(--mantine-color-slate-8)',
        },
        td: {
          color: 'var(--mantine-color-slate-1)',
        },
        tr: {
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(148, 163, 184, 0.04)',
          },
        },
      },
    },
    Divider: {
      styles: {
        root: {
          borderColor: 'rgba(148, 163, 184, 0.12)',
        },
      },
    },
    Alert: {
      defaultProps: {
        radius: 'lg',
      },
      styles: {
        root: {
          border: '1px solid',
        },
      },
    },
    Notification: {
      defaultProps: {
        radius: 'lg',
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-slate-7)',
          borderColor: 'rgba(148, 163, 184, 0.15)',
        },
      },
    },
  },
  other: {
    // Semantic colors for quick access
    frcBlue: '#1a8cff',
    frcOrange: '#ff8800',
    successGreen: '#10b981',
    warningYellow: '#f59e0b',
    errorRed: '#ef4444',
    // Gradients
    gradients: {
      primary: 'linear-gradient(135deg, #1a8cff 0%, #ff8800 100%)',
      blue: 'linear-gradient(135deg, #1a8cff 0%, #0066cc 100%)',
      orange: 'linear-gradient(135deg, #ff8800 0%, #cc6600 100%)',
      surface: 'linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(21, 28, 40, 0.9) 100%)',
      glow: 'radial-gradient(circle at 50% 0%, rgba(29, 161, 242, 0.15), transparent 60%)',
    },
    // Backdrop effects
    backdrop: {
      blur: 'blur(12px)',
      blurHeavy: 'blur(20px)',
    },
    // Transition presets
    transitions: {
      fast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
      normal: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      slow: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      spring: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
})
