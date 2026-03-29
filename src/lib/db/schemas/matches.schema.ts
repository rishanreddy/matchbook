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
  version: 0,
  primaryKey: 'key',
  type: 'object',
  properties: {
    key: { type: 'string', maxLength: 128 },
    eventId: { type: 'string' },
    matchNumber: { type: 'number', minimum: 0 },
    compLevel: { type: 'string' },
    predictedTime: { type: 'string' },
    redAlliance: {
      type: 'array',
      items: { type: 'string' },
    },
    blueAlliance: {
      type: 'array',
      items: { type: 'string' },
    },
    createdAt: { type: 'string' },
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
