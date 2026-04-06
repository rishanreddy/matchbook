import type { RxJsonSchema } from 'rxdb'

export interface AppStateDocType {
  id: string
  onboardingCompleted: boolean
  setupCompletedAt: string
  updatedAt: string
}

export const appStateSchema: RxJsonSchema<AppStateDocType> = {
  title: 'appState schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 64 },
    onboardingCompleted: { type: 'boolean' },
    setupCompletedAt: { type: 'string', maxLength: 64 },
    updatedAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'onboardingCompleted', 'setupCompletedAt', 'updatedAt'],
  indexes: ['onboardingCompleted', 'updatedAt'],
}
