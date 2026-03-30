import { createTheme, rem } from '@mantine/core'

export const appTheme = createTheme({
  primaryColor: 'frc-blue',
  defaultRadius: 'sm',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, SF Mono, Monaco, Consolas, monospace',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontWeight: '700',
    sizes: {
      h1: { fontSize: rem(36), lineHeight: '1.2' },
      h2: { fontSize: rem(28), lineHeight: '1.3' },
      h3: { fontSize: rem(22), lineHeight: '1.4' },
      h4: { fontSize: rem(18), lineHeight: '1.5' },
    },
  },
  colors: {
    'frc-blue': [
      '#e6f2ff',
      '#cce5ff',
      '#99cbff',
      '#66b0ff',
      '#3396ff',
      '#0066b3', // Primary FRC blue
      '#005299',
      '#003d73',
      '#002952',
      '#001a33',
    ],
    'frc-orange': [
      '#fff3e6',
      '#ffe7cc',
      '#ffcf99',
      '#ffb766',
      '#ff9f33',
      '#f57c00', // Primary FRC orange
      '#cc6600',
      '#a35200',
      '#7a3d00',
      '#522900',
    ],
    'slate': [
      '#f8fafc',
      '#f1f5f9',
      '#e2e8f0',
      '#cbd5e1',
      '#94a3b8',
      '#64748b',
      '#475569',
      '#334155',
      '#1e293b',
      '#0f172a',
    ],
  },
  black: '#0f172a',
  white: '#f8fafc',
  shadows: {
    xs: '0 1px 2px rgba(0, 0, 0, 0.3)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.3)',
    md: '0 4px 8px rgba(0, 0, 0, 0.3)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.4)',
    xl: '0 16px 32px rgba(0, 0, 0, 0.5)',
  },
  other: {
    frcBlue: '#0066b3',
    frcOrange: '#f57c00',
    successGreen: '#10b981',
    errorRed: '#ef4444',
  },
})
