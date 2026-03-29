import type { RxJsonSchema } from 'rxdb'

export interface EventDocType {
  id: string
  name: string
  season: number
  startDate: string
  endDate: string
  syncedAt: string
  createdAt: string
}

export const eventSchema: RxJsonSchema<EventDocType> = {
  title: 'events schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    name: { type: 'string' },
    season: { type: 'number', minimum: 0 },
    startDate: { type: 'string' },
    endDate: { type: 'string' },
    syncedAt: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: ['id', 'name', 'season', 'startDate', 'endDate', 'syncedAt', 'createdAt'],
  indexes: ['season', 'startDate'],
}
