import type { RxJsonSchema } from 'rxdb'

export interface ScoutingDataDocType {
  id: string
  eventKey: string
  matchKey: string
  teamKey: string
  scoutId: string
  deviceId: string
  originDeviceId: string
  timestamp: string
  schemaVersion: number
  autoScore: number
  teleopScore: number
  endgameScore: number
  formData: Record<string, unknown>
  syncHash: string
  isNoShow: boolean
  isBrokenRobot: boolean
  createdAt: string
}

export const scoutingDataSchema: RxJsonSchema<ScoutingDataDocType> = {
  title: 'scoutingData schema',
  version: 0,
  // Event-sourced collection: writes should be append-only in app logic.
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventKey: { type: 'string' },
    matchKey: { type: 'string' },
    teamKey: { type: 'string' },
    scoutId: { type: 'string' },
    deviceId: { type: 'string' },
    originDeviceId: { type: 'string' },
    timestamp: { type: 'string' },
    schemaVersion: { type: 'number', minimum: 0 },
    autoScore: { type: 'number' },
    teleopScore: { type: 'number' },
    endgameScore: { type: 'number' },
    formData: { type: 'object', additionalProperties: true },
    syncHash: { type: 'string', maxLength: 128 },
    isNoShow: { type: 'boolean' },
    isBrokenRobot: { type: 'boolean' },
    createdAt: { type: 'string' },
  },
  required: [
    'id',
    'eventKey',
    'matchKey',
    'teamKey',
    'scoutId',
    'deviceId',
    'originDeviceId',
    'timestamp',
    'schemaVersion',
    'autoScore',
    'teleopScore',
    'endgameScore',
    'formData',
    'syncHash',
    'isNoShow',
    'isBrokenRobot',
    'createdAt',
  ],
  indexes: ['eventKey', 'matchKey', 'teamKey', 'syncHash', ['matchKey', 'teamKey']],
}
