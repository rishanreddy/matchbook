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
    '--sjs-primary-backcolor': 'rgba(255, 176, 32, 1)',
    '--sjs-primary-backcolor-light': 'rgba(255, 176, 32, 0.18)',
    '--sjs-primary-backcolor-dark': 'rgba(235, 157, 15, 1)',
    '--sjs-primary-forecolor': 'rgba(20, 16, 6, 1)',
    '--sjs-secondary-backcolor': 'rgba(255, 176, 32, 1)',
    '--sjs-secondary-backcolor-light': 'rgba(255, 176, 32, 0.18)',
    '--sjs-secondary-backcolor-semi-light': 'rgba(255, 176, 32, 0.34)',
    '--sjs-general-backcolor': 'rgba(22, 27, 34, 1)',
    '--sjs-general-backcolor-dark': 'rgba(14, 17, 22, 1)',
    '--sjs-general-backcolor-dim': 'rgba(29, 36, 45, 1)',
    '--sjs-general-backcolor-dim-light': 'rgba(42, 50, 61, 1)',
    '--sjs-general-backcolor-dim-dark': 'rgba(14, 17, 22, 1)',
    '--sjs-general-forecolor': 'rgba(238, 241, 245, 0.96)',
    '--sjs-general-forecolor-light': 'rgba(143, 153, 168, 0.92)',
    '--sjs-general-dim-forecolor': 'rgba(217, 222, 230, 0.96)',
    '--sjs-general-dim-forecolor-light': 'rgba(143, 153, 168, 0.84)',
    '--sjs-border-default': 'rgba(154, 166, 182, 0.4)',
    '--sjs-border-light': 'rgba(154, 166, 182, 0.22)',
    '--sjs-shadow-small': '0 0 0 1px rgba(148, 163, 184, 0.16), 0 8px 16px rgba(0, 0, 0, 0.22), 0 2px 4px rgba(0, 0, 0, 0.18)',
    '--sjs-shadow-medium': 'inset 0 0 0 1px rgba(148, 163, 184, 0.12), 0 6px 18px rgba(0, 0, 0, 0.24)',
    '--sjs-corner-radius': '10px',
  },
}

export function applyMatchbookSurveyTheme(model: Model): void {
  model.applyTheme(MATCHBOOK_SURVEY_THEME)
}
