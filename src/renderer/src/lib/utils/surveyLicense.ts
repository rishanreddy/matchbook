import { setLicenseKey } from 'survey-core'

const SURVEYJS_LICENSE_STORAGE_KEY = 'surveyjs_license_key'

function normalizeLicenseKey(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function getStoredSurveyJsLicenseKey(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  return normalizeLicenseKey(window.localStorage.getItem(SURVEYJS_LICENSE_STORAGE_KEY))
}

export function getConfiguredSurveyJsLicenseKey(): string {
  const envKey = normalizeLicenseKey(import.meta.env.VITE_SURVEYJS_LICENSE_KEY)
  if (envKey.length > 0) {
    return envKey
  }

  return getStoredSurveyJsLicenseKey()
}

export function applyConfiguredSurveyJsLicenseKey(): string {
  const key = getConfiguredSurveyJsLicenseKey()
  if (key.length > 0) {
    setLicenseKey(key)
  }

  return key
}

export function saveSurveyJsLicenseKey(value: string): string {
  const normalized = normalizeLicenseKey(value)

  if (typeof window !== 'undefined') {
    if (normalized.length === 0) {
      window.localStorage.removeItem(SURVEYJS_LICENSE_STORAGE_KEY)
    } else {
      window.localStorage.setItem(SURVEYJS_LICENSE_STORAGE_KEY, normalized)
    }
  }

  const activeKey = getConfiguredSurveyJsLicenseKey()
  if (activeKey.length > 0) {
    setLicenseKey(activeKey)
  }

  return activeKey
}
