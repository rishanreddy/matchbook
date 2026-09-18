import { createTheme, rem, virtualColor } from '@mantine/core'

export const appTheme = createTheme({
  primaryColor: 'amber',
  defaultRadius: 'sm',
  cursorType: 'pointer',
  // IBM Plex Sans is an engineering face: open apertures, unambiguous 1/l/7, and
  // real tabular figures. Both families are bundled locally (see main.tsx) so
  // typography survives a venue with no internet.
  fontFamily: '"IBM Plex Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  // Reserved for figures that get compared column-to-column (team numbers, match
  // numbers, averages), never for labels.
  fontFamilyMonospace: '"IBM Plex Mono", SF Mono, Monaco, Consolas, monospace',
  headings: {
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontWeight: '600',
    // A tighter scale than the previous 48px display. This is a dense working tool
    // read at arm's length, not a marketing page; oversized headings were pushing
    // the actual data below the fold.
    sizes: {
      h1: { fontSize: rem(32), lineHeight: '1.2', fontWeight: '600' },
      h2: { fontSize: rem(24), lineHeight: '1.25', fontWeight: '600' },
      h3: { fontSize: rem(19), lineHeight: '1.3', fontWeight: '600' },
      h4: { fontSize: rem(16), lineHeight: '1.4', fontWeight: '600' },
      h5: { fontSize: rem(14), lineHeight: '1.45', fontWeight: '600' },
      h6: { fontSize: rem(13), lineHeight: '1.45', fontWeight: '600' },
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
    // The single interactive accent. Red and blue are reserved for alliance
    // meaning, so app chrome must not use either.
    amber: [
      '#fff8e8',
      '#ffecc2',
      '#ffdd94',
      '#ffcc61',
      '#ffbe3a',
      '#ffb020', // 5 - primary
      '#eb9d0f',
      '#c77f06',
      '#9b6205',
      '#6d4404',
    ],
    // Alliance colours. Data only, and always paired with a text label so the
    // distinction survives colour-blind vision.
    'alliance-red': [
      '#ffeceb',
      '#ffd3d0',
      '#ffa8a2',
      '#f97a72',
      '#ec5850',
      '#e4483f',
      '#c8352d',
      '#a12923',
      '#7c201b',
      '#561614',
    ],
    'alliance-blue': [
      '#e9f2ff',
      '#cbdfff',
      '#9cc2ff',
      '#6aa2fb',
      '#4489f1',
      '#2f7dea',
      '#2165c4',
      '#18509d',
      '#123c77',
      '#0c2951',
    ],
    // `frc-blue` and `frc-orange` are legacy names still used at ~190 call sites.
    // They are mapped to a neutral graphite ramp rather than to the accent: when they
    // aliased amber, every incidental icon, badge and border in the app turned amber
    // and the interface read as decorated rather than calm. Amber now appears only on
    // the primary action and the active nav row, so it actually means something.
    'frc-blue': [
      '#f2f4f7',
      '#e2e6ec',
      '#c6ccd6',
      '#a7afbc',
      '#8b95a3',
      '#6f7986',
      '#565f6b',
      '#3f4753',
      '#2a323d',
      '#1a2028',
    ],
    'frc-orange': [
      '#f2f4f7',
      '#e2e6ec',
      '#c6ccd6',
      '#a7afbc',
      '#8b95a3',
      '#6f7986',
      '#565f6b',
      '#3f4753',
      '#2a323d',
      '#1a2028',
    ],
    slate: [
      '#eef1f5', // 0 - primary text          15.3:1 on a card
      '#d9dee6', // 1 - secondary text        12.8:1
      '#bcc4d0', // 2 - dimmed text            9.8:1
      '#a7b0bd', // 3 - muted                  7.9:1
      '#8f99a8', // 4 - subtle                 6.0:1
      '#828c9a', // 5 - faintest text          5.1:1 (AA floor)
      '#2a323d', // 6 - elevated surfaces
      '#1d242d', // 7 - cards
      '#161b22', // 8 - sidebar
      '#0e1116', // 9 - main background
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
  black: '#0a0d11',
  white: '#eef1f5',
  primaryShade: { light: 5, dark: 4 },
  autoContrast: true,
  luminanceThreshold: 0.3,
  shadows: {
    xs: 'none',
    sm: 'none',
    md: '0 4px 12px rgba(0, 0, 0, 0.28)',
    lg: '0 8px 28px rgba(0, 0, 0, 0.35)',
    xl: '0 16px 48px rgba(0, 0, 0, 0.45)',
  },
  defaultGradient: {
    from: 'amber.5',
    to: 'amber.7',
    deg: 135,
  },
  components: {
    Button: {
      defaultProps: {
        fw: 500,
        size: 'md',
        radius: 'sm',
      },
      styles: {
        root: {
          transition: 'background-color 0.15s ease, border-color 0.15s ease',
        },
      },
    },
    Card: {
      defaultProps: {
        padding: 'lg',
        radius: 'sm',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--surface-raised)',
          borderColor: 'var(--border-default)',
        },
      },
    },
    Paper: {
      defaultProps: {
        radius: 'sm',
      },
      styles: {
        root: {
          backgroundColor: 'var(--surface-raised)',
        },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.6,
          blur: 2,
        },
      },
      styles: {
        content: {
          backgroundColor: 'var(--surface-raised)',
          border: '1px solid var(--border-default)',
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
            boxShadow: '0 0 0 2px rgba(255, 176, 32, 0.15)',
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
        radius: 'sm',
      },
      styles: {
        root: {
          border: '1px solid',
        },
      },
    },
    Notification: {
      defaultProps: {
        radius: 'sm',
      },
      styles: {
        root: {
          backgroundColor: 'var(--surface-overlay)',
          borderColor: 'var(--border-default)',
        },
      },
    },
  },
  other: {
    // Semantic colors for quick access
    accent: '#ffb020',
    allianceRed: '#e4483f',
    allianceBlue: '#2f7dea',
    successGreen: '#10b981',
    warningYellow: '#f59e0b',
    errorRed: '#ef4444',
    // Gradients
    gradients: {
      primary: 'linear-gradient(135deg, #ffb020 0%, #eb9d0f 100%)',
      surface: 'linear-gradient(180deg, rgba(29, 36, 45, 0.8) 0%, rgba(22, 27, 34, 0.9) 100%)',
      glow: 'radial-gradient(circle at 50% 0%, rgba(255, 176, 32, 0.12), transparent 60%)',
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
