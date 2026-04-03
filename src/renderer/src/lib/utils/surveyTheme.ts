import type { ITheme, Model } from 'survey-core'
import { LayeredDark } from 'survey-core/themes'

type SurveyThemeWithVariables = ITheme & {
  cssVariables?: Record<string, string>
}

const baseTheme = LayeredDark as SurveyThemeWithVariables

export const MATCHBOOK_SURVEY_THEME: SurveyThemeWithVariables = {
  ...baseTheme,
  cssVariables: {
    ...(baseTheme.cssVariables ?? {}),
    '--sjs-primary-backcolor': 'rgba(26, 140, 255, 1)',
    '--sjs-primary-backcolor-light': 'rgba(26, 140, 255, 0.18)',
    '--sjs-primary-backcolor-dark': 'rgba(90, 174, 255, 1)',
    '--sjs-primary-forecolor': 'rgba(246, 250, 255, 1)',
    '--sjs-secondary-backcolor': 'rgba(255, 136, 0, 1)',
    '--sjs-secondary-backcolor-light': 'rgba(255, 136, 0, 0.18)',
    '--sjs-secondary-backcolor-semi-light': 'rgba(255, 136, 0, 0.34)',
    '--sjs-general-backcolor': 'rgba(9, 18, 32, 1)',
    '--sjs-general-backcolor-dark': 'rgba(11, 23, 41, 1)',
    '--sjs-general-backcolor-dim': 'rgba(14, 27, 48, 1)',
    '--sjs-general-backcolor-dim-light': 'rgba(18, 32, 56, 1)',
    '--sjs-general-backcolor-dim-dark': 'rgba(10, 21, 38, 1)',
    '--sjs-general-forecolor': 'rgba(241, 245, 249, 0.96)',
    '--sjs-general-forecolor-light': 'rgba(148, 163, 184, 0.92)',
    '--sjs-general-dim-forecolor': 'rgba(226, 232, 240, 0.96)',
    '--sjs-general-dim-forecolor-light': 'rgba(148, 163, 184, 0.84)',
    '--sjs-border-default': 'rgba(101, 132, 171, 0.48)',
    '--sjs-border-light': 'rgba(101, 132, 171, 0.3)',
    '--sjs-shadow-small': '0 0 0 1px rgba(148, 163, 184, 0.16), 0 8px 16px rgba(0, 0, 0, 0.22), 0 2px 4px rgba(0, 0, 0, 0.18)',
    '--sjs-shadow-medium': 'inset 0 0 0 1px rgba(148, 163, 184, 0.12), 0 6px 18px rgba(0, 0, 0, 0.24)',
    '--sjs-corner-radius': '10px',
  },
}

export function applyMatchbookSurveyTheme(model: Model): void {
  model.applyTheme(MATCHBOOK_SURVEY_THEME)
}
