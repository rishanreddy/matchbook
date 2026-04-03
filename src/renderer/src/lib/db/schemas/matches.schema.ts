import type { RxJsonSchema } from 'rxdb'

export interface MatchDocType {
  key: string
  eventId: string
  matchNumber: number
  compLevel: string
  predictedTime: string
  redAlliance: string[]
  blueAlliance: string[]
  createdAt: string
}

export const matchSchema: RxJsonSchema<MatchDocType> = {
  title: 'matches schema',
  version: 1,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 128 },
    eventId: { type: 'string', maxLength: 128 },
    matchNumber: { type: 'integer', minimum: 0, maximum: 9999, multipleOf: 1 },
    compLevel: { type: 'string', maxLength: 16 },
    predictedTime: { type: 'string', maxLength: 64 },
    redAlliance: {
      type: 'array',
      items: { type: 'string' },
    },
    blueAlliance: {
      type: 'array',
      items: { type: 'string' },
    },
    createdAt: { type: 'string', maxLength: 64 },
  },
  required: [
    'key',
    'eventId',
    'matchNumber',
    'compLevel',
    'predictedTime',
    'redAlliance',
    'blueAlliance',
    'createdAt',
  ],
  indexes: ['eventId', 'matchNumber', ['eventId', 'compLevel', 'matchNumber']],
}
