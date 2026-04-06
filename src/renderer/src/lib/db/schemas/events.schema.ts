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
    name: { type: 'string', maxLength: 256 },
    season: { type: 'integer', minimum: 1990, maximum: 2100, multipleOf: 1 },
    startDate: { type: 'string', maxLength: 64 },
    endDate: { type: 'string', maxLength: 64 },
    syncedAt: { type: 'string', maxLength: 64 },
    createdAt: { type: 'string', maxLength: 64 },
  },
  required: ['id', 'name', 'season', 'startDate', 'endDate', 'syncedAt', 'createdAt'],
  indexes: ['season', 'startDate'],
}
