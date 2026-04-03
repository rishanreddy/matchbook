export type AnalysisValueKind = 'number' | 'boolean' | 'text'

export type AnalysisChartType = 'bar' | 'line' | 'area'

export type AnalysisAggregation = 'average' | 'sum' | 'min' | 'max' | 'trueCount' | 'responseCount'

export type AnalysisFieldDefinition = {
  name: string
  title: string
  questionType: string
  valueKind: AnalysisValueKind
}

export type AnalysisFieldConfig = {
  fieldName: string
  fieldLabel: string
  valueKind: AnalysisValueKind
  enabled: boolean
  chartType: AnalysisChartType
  aggregation: AnalysisAggregation
}

type PersistedConfigMap = Record<string, Partial<AnalysisFieldConfig>>

const ANALYSIS_CONFIG_STORAGE_KEY = 'analysis_field_configs_v1'

const SUPPORTED_CHART_TYPES: AnalysisChartType[] = ['bar', 'line', 'area']

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function inferValueKind(questionType: string, element: Record<string, unknown>): AnalysisValueKind {
  if (questionType === 'boolean') {
    return 'boolean'
  }

  if (questionType === 'rating') {
    return 'number'
  }

  if (questionType === 'text') {
    const inputType = asNonEmptyString(element.inputType)?.toLowerCase()
    if (inputType === 'number' || inputType === 'range') {
      return 'number'
    }
  }

  return 'text'
}

function collectElementFields(elementsRaw: unknown, output: AnalysisFieldDefinition[], seen: Set<string>): void {
  if (!Array.isArray(elementsRaw)) {
    return
  }

  elementsRaw.forEach((entry) => {
    const element = asRecord(entry)
    if (!element) {
      return
    }

    const questionType = asNonEmptyString(element.type)?.toLowerCase() ?? 'text'
    const name = asNonEmptyString(element.name)

    if (
      name &&
      !name.startsWith('_') &&
      questionType !== 'html' &&
      questionType !== 'image'
    ) {
      if (!seen.has(name)) {
        seen.add(name)
        output.push({
          name,
          title: asNonEmptyString(element.title) ?? name,
          questionType,
          valueKind: inferValueKind(questionType, element),
        })
      }
    }

    collectElementFields(element.elements, output, seen)
    collectElementFields(element.templateElements, output, seen)
  })
}

export function extractSurveyAnalysisFields(surveyJson: Record<string, unknown>): AnalysisFieldDefinition[] {
  const output: AnalysisFieldDefinition[] = []
  const seen = new Set<string>()

  collectElementFields(surveyJson.elements, output, seen)

  const pages = Array.isArray(surveyJson.pages) ? surveyJson.pages : []
  pages.forEach((pageEntry) => {
    const page = asRecord(pageEntry)
    if (!page) {
      return
    }
    collectElementFields(page.elements, output, seen)
  })

  return output
}

export function getAnalysisConfigStorageKey(): string {
  return ANALYSIS_CONFIG_STORAGE_KEY
}

export function getAllowedAggregations(valueKind: AnalysisValueKind): AnalysisAggregation[] {
  if (valueKind === 'number') {
    return ['average', 'sum', 'min', 'max']
  }

  if (valueKind === 'boolean') {
    return ['trueCount', 'responseCount']
  }

  return ['responseCount']
}

function getDefaultAggregation(valueKind: AnalysisValueKind): AnalysisAggregation {
  return getAllowedAggregations(valueKind)[0]
}

function getDefaultChartType(valueKind: AnalysisValueKind): AnalysisChartType {
  if (valueKind === 'number') {
    return 'line'
  }

  return 'bar'
}

function normalizeFieldConfig(field: AnalysisFieldDefinition, persisted: Partial<AnalysisFieldConfig> | undefined): AnalysisFieldConfig {
  const allowedAggregations = getAllowedAggregations(field.valueKind)
  const aggregationCandidate = persisted?.aggregation
  const chartTypeCandidate = persisted?.chartType

  return {
    fieldName: field.name,
    fieldLabel: field.title,
    valueKind: field.valueKind,
    enabled: typeof persisted?.enabled === 'boolean' ? persisted.enabled : field.valueKind !== 'text',
    chartType:
      typeof chartTypeCandidate === 'string' && SUPPORTED_CHART_TYPES.includes(chartTypeCandidate as AnalysisChartType)
        ? (chartTypeCandidate as AnalysisChartType)
        : getDefaultChartType(field.valueKind),
    aggregation:
      typeof aggregationCandidate === 'string' && allowedAggregations.includes(aggregationCandidate as AnalysisAggregation)
        ? (aggregationCandidate as AnalysisAggregation)
        : getDefaultAggregation(field.valueKind),
  }
}

function readPersistedConfigMap(): PersistedConfigMap {
  if (typeof window === 'undefined') {
    return {}
  }

  const raw = window.localStorage.getItem(ANALYSIS_CONFIG_STORAGE_KEY)
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    const record = asRecord(parsed)
    return record ? (record as PersistedConfigMap) : {}
  } catch {
    return {}
  }
}

export function loadAnalysisFieldConfigs(fields: AnalysisFieldDefinition[]): AnalysisFieldConfig[] {
  const persistedMap = readPersistedConfigMap()
  return fields.map((field) => normalizeFieldConfig(field, persistedMap[field.name]))
}

export function saveAnalysisFieldConfigs(configs: AnalysisFieldConfig[]): void {
  if (typeof window === 'undefined') {
    return
  }

  const payload: PersistedConfigMap = {}
  configs.forEach((config) => {
    payload[config.fieldName] = {
      enabled: config.enabled,
      chartType: config.chartType,
      aggregation: config.aggregation,
      fieldLabel: config.fieldLabel,
      valueKind: config.valueKind,
    }
  })

  try {
    window.localStorage.setItem(ANALYSIS_CONFIG_STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new CustomEvent('analysis:config-updated'))
  } catch {
    // ignore persistence failures
  }
}
