import type { RxJsonSchema } from 'rxdb'

export interface ScoutingDataDocType {
  id: string
  eventId: string | null
  deviceId: string
  matchNumber: number
  teamNumber: number
  timestamp: string
  autoScore: number
  teleopScore: number
  endgameScore: number
  formData: Record<string, unknown>
  notes: string
  createdAt: string
}

export const scoutingDataSchema: RxJsonSchema<ScoutingDataDocType> = {
  title: 'scoutingData schema',
  version: 5,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventId: {
      type: ['string', 'null'],
      maxLength: 128,
    },
    deviceId: { type: 'string', maxLength: 128 },
    matchNumber: { type: 'integer', minimum: 0, maximum: 9999, multipleOf: 1 },
    teamNumber: { type: 'integer', minimum: 0, maximum: 999999, multipleOf: 1 },
    timestamp: { type: 'string' },
    autoScore: { type: 'integer', minimum: 0, multipleOf: 1 },
    teleopScore: { type: 'integer', minimum: 0, multipleOf: 1 },
    endgameScore: { type: 'integer', minimum: 0, multipleOf: 1 },
    formData: { type: 'object', additionalProperties: true },
    notes: { type: 'string' },
    createdAt: { type: 'string' },
  },
  required: [
    'id',
    'eventId',
    'deviceId',
    'matchNumber',
    'teamNumber',
    'timestamp',
    'autoScore',
    'teleopScore',
    'endgameScore',
    'formData',
    'notes',
    'createdAt',
  ],
  indexes: ['eventId', 'deviceId', 'matchNumber', 'teamNumber', ['eventId', 'matchNumber'], ['eventId', 'teamNumber']],
}
