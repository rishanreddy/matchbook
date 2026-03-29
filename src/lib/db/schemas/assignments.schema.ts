import type { RxJsonSchema } from 'rxdb'

export interface AssignmentDocType {
  id: string
  eventKey: string
  matchKey: string
  alliancePosition: 'red1' | 'red2' | 'red3' | 'blue1' | 'blue2' | 'blue3'
  teamKey: string
  scoutId: string
  deviceId: string
  assignedAt: string
}

export const assignmentSchema: RxJsonSchema<AssignmentDocType> = {
  title: 'assignments schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    eventKey: { type: 'string' },
    matchKey: { type: 'string' },
    alliancePosition: {
      type: 'string',
      enum: ['red1', 'red2', 'red3', 'blue1', 'blue2', 'blue3'],
    },
    teamKey: { type: 'string' },
    scoutId: { type: 'string' },
    deviceId: { type: 'string' },
    assignedAt: { type: 'string' },
  },
  required: [
    'id',
    'eventKey',
    'matchKey',
    'alliancePosition',
    'teamKey',
    'scoutId',
    'deviceId',
    'assignedAt',
  ],
  indexes: ['eventKey', 'matchKey', 'scoutId', 'deviceId', ['matchKey', 'alliancePosition']],
}
